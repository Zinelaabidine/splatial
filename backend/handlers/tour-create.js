"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { validateTourInput, createTour } = require("../lib/tours");
const { getOwnerProfile } = require("../lib/scene-owner");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * POST /api/v1/scenes/{sceneId}/tours
 *
 * Create a guided tour on a visible scene.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const inputResult = validateTourInput({
    title: body.title,
    items: body.items,
    segmentDurationMs: body.segmentDurationMs,
  });
  if (!inputResult.ok) {
    return response(400, { error: inputResult.error });
  }

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: SCENES_TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  const isOwner = item.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(item) === "PUBLIC";
  if (!isOwner && !isPublic) {
    return response(403, { error: "Forbidden: scene is not visible to this user" });
  }

  const creatorProfile = await getOwnerProfile(userId);
  if (!creatorProfile) {
    return response(400, { error: "Profile required before creating a tour" });
  }

  const tour = await createTour({
    sceneId,
    userId,
    creatorProfile,
    title: inputResult.title,
    items: inputResult.items,
    segmentDurationMs: inputResult.segmentDurationMs,
  });

  return response(200, tour);
};
