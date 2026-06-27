"use strict";

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { mapProgressFromItem } = require("../lib/progress-fields");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

/**
 * GET /api/v1/scenes
 *
 * Returns all named scenes (created via POST /api/v1/scenes) owned by the
 * authenticated user.
 *
 * TODO: Add a DynamoDB GSI on `user_id` (e.g. user_id-created_at-index) for
 *       production-scale queries. The current table-scan + filter is acceptable
 *       for MVP but will not scale.
 *
 * Success response (200):
 *   { "scenes": [{ "sceneId": "...", "name": "...", "inputType": "...", "status": "...", "createdAt": "..." }] }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const result = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      // Only return records that belong to this user AND were created via
      // the scene-management flow (i.e. have a `name` attribute).
      FilterExpression: "user_id = :uid AND attribute_exists(#nm)",
      ExpressionAttributeNames: { "#nm": "name" },
      ExpressionAttributeValues: { ":uid": { S: userId } },
    })
  );

  const scenes = (result.Items ?? []).map((item) => ({
    sceneId:   item.scene_id?.S   ?? "",
    name:      item.name?.S       ?? "",
    inputType: item.input_type?.S ?? "",
    status:    item.status?.S     ?? "",
    createdAt: item.created_at?.S ?? "",
    ...(item.ply_key ? { plyKey: item.ply_key.S } : {}),
    ...mapProgressFromItem(item),
  }));

  // Sort newest-first by createdAt (ISO strings sort lexicographically).
  scenes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return response(200, { scenes });
};
