"use strict";

const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const TABLE  = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;

/**
 * POST /api/v1/scenes/seed
 *
 * Creates a scene entry in READY status for a PLY file that was (or will be)
 * manually uploaded to the splat-scenes S3 bucket.
 *
 * Request body:
 *   { "name": "My Garden Scene" }
 *
 * Success response (201):
 *   {
 *     "sceneId":   "...",
 *     "name":      "My Garden Scene",
 *     "status":    "READY",
 *     "plyBucket": "splatial-dev-splat-scenes",
 *     "plyKey":    "splat-scenes/<userId>/<sceneId>/scene.ply",
 *     "createdAt": "..."
 *   }
 *
 * After receiving the response, upload the PLY file manually:
 *   aws s3 cp ./your-scene.ply s3://<plyBucket>/<plyKey>
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const { name } = body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return response(400, { error: "Missing required field: name" });
  }

  const sceneId     = randomUUID();
  const trimmedName = name.trim();
  const plyKey      = `splat-scenes/${userId}/${sceneId}/scene.ply`;
  const now         = new Date().toISOString();

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        scene_id:   { S: sceneId },
        user_id:    { S: userId },
        name:       { S: trimmedName },
        input_type: { S: "ply" },
        status:     { S: "READY" },
        ply_key:    { S: plyKey },
        created_at: { S: now },
        updated_at: { S: now },
        // No expires_at — completed scenes should persist indefinitely.
      },
      ConditionExpression: "attribute_not_exists(scene_id)",
    })
  );

  return response(201, {
    sceneId,
    name:      trimmedName,
    status:    "READY",
    plyBucket: SPLAT_BUCKET,
    plyKey,
    createdAt: now,
  });
};
