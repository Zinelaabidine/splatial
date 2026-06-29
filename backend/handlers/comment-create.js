"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { createComment, validateBody } = require("../lib/comments");
const { parseMentionHandles, resolveMentions } = require("../lib/mentions");
const { getOwnerProfile } = require("../lib/scene-owner");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * POST /api/v1/scenes/{sceneId}/comments
 *
 * Create a comment on a visible scene.
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

  let validatedBody;
  try {
    validatedBody = validateBody(body.body);
  } catch (err) {
    return response(err.statusCode ?? 400, { error: err.message });
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

  const authorProfile = await getOwnerProfile(userId);
  if (!authorProfile) {
    return response(400, { error: "Profile required before commenting" });
  }

  const handles = parseMentionHandles(validatedBody);
  const mentions = await resolveMentions(dynamo, handles);

  const comment = await createComment({
    sceneId,
    userId,
    authorProfile,
    body: validatedBody,
    mentions,
  });

  return response(200, comment);
};
