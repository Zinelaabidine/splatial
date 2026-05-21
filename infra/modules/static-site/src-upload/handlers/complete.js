"use strict";

const { S3Client, CompleteMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const TABLE = process.env.SCENES_TABLE_NAME;

/**
 * POST /upload/complete
 *
 * Request body:
 *   {
 *     "uploadId": "...",
 *     "key":      "uploads/<userId>/...",
 *     "sceneId":  "...",
 *     "parts":    [{ "partNumber": 1, "eTag": "\"abc123\"" }, ...]
 *   }
 *
 * Success response (200):
 *   { "sceneId": "...", "status": "PROCESSING", "location": "https://..." }
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

  const { uploadId, key, sceneId, parts } = body;

  if (!uploadId || !key || !sceneId) {
    return response(400, { error: "Missing required fields: uploadId, key, sceneId" });
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    return response(400, { error: "parts must be a non-empty array of { partNumber, eTag }" });
  }

  // Verify key ownership before assembling
  if (!key.startsWith(`uploads/${userId}/`)) {
    return response(403, { error: "Forbidden: key does not belong to this user" });
  }

  // Assemble all parts into the final S3 object
  const { Location } = await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map(({ partNumber, eTag }) => ({
          PartNumber: partNumber,
          ETag: eTag,
        })),
      },
    })
  );

  // Transition DynamoDB record from PENDING_UPLOAD → PROCESSING.
  // The ConditionExpression guards against double-completing an upload.
  // Extend TTL to 7 days so the record survives a slow processing pipeline.
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const expiresAt = Math.floor(nowMs / 1000) + 7 * 24 * 60 * 60;

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression:
        "SET #s = :status, updated_at = :now, s3_location = :loc, expires_at = :ttl",
      ConditionExpression: "user_id = :uid AND #s = :pending",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": { S: "PROCESSING" },
        ":now": { S: now },
        ":loc": { S: Location ?? key },
        ":uid": { S: userId },
        ":pending": { S: "PENDING_UPLOAD" },
        ":ttl": { N: String(expiresAt) },
      },
    })
  );

  return response(200, { sceneId, status: "PROCESSING", location: Location });
};
