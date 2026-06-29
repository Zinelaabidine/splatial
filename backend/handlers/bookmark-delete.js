"use strict";

const { DynamoDBClient, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const BOOKMARKS_TABLE = process.env.BOOKMARKS_TABLE_NAME;

/**
 * DELETE /api/v1/scenes/{sceneId}/bookmark
 *
 * Remove a scene from the caller's bookmarks list.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  await dynamo.send(
    new DeleteItemCommand({
      TableName: BOOKMARKS_TABLE,
      Key: {
        user_id: { S: userId },
        scene_id: { S: sceneId },
      },
    })
  );

  return response(200, { bookmarked: false });
};
