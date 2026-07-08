"use strict";

const { S3Client, CompleteMultipartUploadCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, UpdateItemCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getUserTier } = require("../lib/user-tier");
const { getStorageCapBytes, getStorageUsedBytes, adjustStorageUsedBytes } = require("../lib/storage-quota");
const { deleteObjectIfPresent } = require("../lib/s3-cleanup");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const TABLE  = process.env.SCENES_TABLE_NAME;

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
 * Success response (202):
 *   { "sceneId": "...", "status": "UPLOADED", "location": "https://..." }
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

  if (!key.startsWith(`users/${userId}/`)) {
    return response(403, { error: "Forbidden: key does not belong to this user" });
  }

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

  // Defense-in-depth true-up: init.js only gated on a client-declared size.
  // This is the real enforcement, measured directly from the completed S3
  // object — a lying or wrong client-declared size can't get past this.
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  const realSizeBytes = head.ContentLength ?? 0;

  const tier = await getUserTier(dynamo, userId);
  const capBytes = getStorageCapBytes(tier);
  const usedBytes = await getStorageUsedBytes(dynamo, userId);

  if (usedBytes + realSizeBytes > capBytes) {
    await deleteObjectIfPresent(s3, BUCKET, key, { sceneId, userId });
    await dynamo.send(
      new DeleteItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sceneId } },
        ConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": { S: userId } },
      })
    );
    return response(413, {
      error: "Upload exceeded your storage allowance; the file was not saved",
      tier,
      capBytes,
      usedBytes,
      realSizeBytes,
    });
  }

  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression:
        "SET #s = :status, updated_at = :now, s3_location = :loc, raw_size_bytes = :size REMOVE expires_at",
      ConditionExpression: "user_id = :uid AND #s = :pending",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status":  { S: "UPLOADED" },
        ":now":     { S: now },
        ":loc":     { S: Location ?? key },
        ":size":    { N: String(realSizeBytes) },
        ":uid":     { S: userId },
        ":pending": { S: "PENDING_UPLOAD" },
      },
    })
  );

  await adjustStorageUsedBytes(dynamo, userId, realSizeBytes);

  return response(202, { sceneId, status: "UPLOADED", location: Location });
};
