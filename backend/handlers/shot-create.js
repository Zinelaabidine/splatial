"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { validateViewMatrix, validateLabel, createShot } = require("../lib/shots");
const { getOwnerProfile } = require("../lib/scene-owner");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * POST /api/v1/scenes/{sceneId}/shots
 *
 * Save a camera viewpoint on a visible scene.
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

  const matrixResult = validateViewMatrix(body.viewMatrix);
  if (!matrixResult.ok) {
    return response(400, { error: matrixResult.error });
  }

  const labelResult = validateLabel(body.label);
  if (!labelResult.ok) {
    return response(400, { error: labelResult.error });
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
    return response(400, { error: "Profile required before saving a shot" });
  }

  const shot = await createShot({
    sceneId,
    userId,
    creatorProfile,
    viewMatrix: matrixResult.viewMatrix,
    label: labelResult.label,
  });

  return response(200, shot);
};
