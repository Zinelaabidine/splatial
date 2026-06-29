"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { sceneResponseFromItem } = require("../lib/scene-response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;

async function presignedThumbnailUrl(item) {
  const key = item.thumbnail_key?.S;
  if (!key) return undefined;
  const bucket = item.thumbnail_bucket?.S ?? SPLAT_BUCKET;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

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
 *   { "scenes": [{ "sceneId": "...", "name": "...", "inputType": "...", "status": "...", "createdAt": "...", "visibility": "PRIVATE" | "PUBLIC" }] }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const result = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "user_id = :uid AND attribute_exists(#nm)",
      ExpressionAttributeNames: { "#nm": "name" },
      ExpressionAttributeValues: { ":uid": { S: userId } },
    })
  );

  const scenes = await Promise.all(
    (result.Items ?? []).map(async (item) => {
      const thumbnailUrl = await presignedThumbnailUrl(item);
      return sceneResponseFromItem(item, thumbnailUrl);
    })
  );

  scenes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return response(200, { scenes });
};
