"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

/**
 * GET /scenes/{sceneId}
 *
 * Returns the current processing status of a scene owned by the caller.
 *
 * Success response (200):
 *   { "sceneId": "...", "status": "PROCESSING" | "READY" | "FAILED", "location": "..." }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId) return response(400, { error: "Missing path parameter: sceneId" });

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  if (item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  return response(200, {
    sceneId,
    status: item.status?.S ?? "PROCESSING",
    location: item.s3_location?.S ?? null,
    visibility: sceneVisibilityFromItem(item),
  });
};
