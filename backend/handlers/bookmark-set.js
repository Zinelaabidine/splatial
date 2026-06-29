"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;
const BOOKMARKS_TABLE = process.env.BOOKMARKS_TABLE_NAME;

/**
 * PUT /api/v1/scenes/{sceneId}/bookmark
 *
 * Save a scene to the caller's bookmarks list.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
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

  await dynamo.send(
    new PutItemCommand({
      TableName: BOOKMARKS_TABLE,
      Item: {
        user_id: { S: userId },
        scene_id: { S: sceneId },
        added_at: { S: new Date().toISOString() },
      },
    })
  );

  return response(200, { bookmarked: true });
};
