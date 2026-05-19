"use strict";

const { S3Client, CreateMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, QueryCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const TABLE = process.env.SCENES_TABLE_NAME;

// Maximum number of in-flight uploads allowed per user at any one time.
const QUOTA_MAX_PENDING = 5;

const ALLOWED_CONTENT_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
  "application/octet-stream",
  "video/mp4",
  "video/quicktime",
]);

/**
 * Returns the number of uploads the user currently has in a non-terminal state
 * (PENDING_UPLOAD or PROCESSING) by querying the user_id-status-index GSI.
 */
async function countActiveUploads(userId) {
  let count = 0;

  for (const status of ["PENDING_UPLOAD", "PROCESSING"]) {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "user_id-status-index",
        KeyConditionExpression: "user_id = :uid AND #s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":uid": { S: userId },
          ":status": { S: status },
        },
        Select: "COUNT",
      })
    );
    count += result.Count ?? 0;
  }

  return count;
}

/**
 * POST /upload/init
 *
 * Request body:
 *   { "filename": "scene.glb", "contentType": "model/gltf-binary" }
 *
 * Success response (200):
 *   { "uploadId": "...", "key": "uploads/<userId>/<sceneId>/<filename>", "sceneId": "..." }
 *
 * Error responses:
 *   400 – missing / invalid body fields
 *   415 – unsupported content type
 *   429 – quota exceeded
 *   500 – unexpected server error
 */
exports.handler = async (event) => {
  try {
    // ── 1. Extract caller identity from Cognito JWT claims ──────────────────
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    const userId = claims?.sub;

    if (!userId) {
      return response(401, { error: "Unauthorized: missing user identity" });
    }

    // ── 2. Parse and validate request body ──────────────────────────────────
    let body;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return response(400, { error: "Invalid JSON body" });
    }

    const { filename, contentType } = body;

    if (!filename || typeof filename !== "string" || filename.trim() === "") {
      return response(400, { error: "Missing required field: filename" });
    }

    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return response(415, {
        error: "Unsupported content type",
        allowed: [...ALLOWED_CONTENT_TYPES],
      });
    }

    // ── 3. Quota check ───────────────────────────────────────────────────────
    const activeCount = await countActiveUploads(userId);

    if (activeCount >= QUOTA_MAX_PENDING) {
      return response(429, {
        error: "Upload quota exceeded",
        detail: `Maximum ${QUOTA_MAX_PENDING} concurrent uploads allowed`,
        active: activeCount,
      });
    }

    // ── 4. Generate identifiers and S3 object key ────────────────────────────
    const sceneId = randomUUID();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
    const key = `uploads/${userId}/${sceneId}/${safeFilename}`;

    // ── 5. Initiate S3 multipart upload ──────────────────────────────────────
    const { UploadId } = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
        // Server-side encryption is enforced at the bucket level (AES256).
        ServerSideEncryption: "AES256",
        Metadata: {
          "user-id": userId,
          "scene-id": sceneId,
        },
      })
    );

    // ── 6. Write PENDING_UPLOAD record to DynamoDB ───────────────────────────
    const now = new Date().toISOString();

    await dynamo.send(
      new PutItemCommand({
        TableName: TABLE,
        Item: {
          scene_id: { S: sceneId },
          user_id: { S: userId },
          status: { S: "PENDING_UPLOAD" },
          upload_id: { S: UploadId },
          s3_key: { S: key },
          filename: { S: safeFilename },
          content_type: { S: contentType },
          created_at: { S: now },
          updated_at: { S: now },
        },
        // Guard against accidental overwrites on UUID collision (astronomically
        // unlikely but enforced for correctness).
        ConditionExpression: "attribute_not_exists(scene_id)",
      })
    );

    // ── 7. Return upload credentials to the client ───────────────────────────
    return response(200, { uploadId: UploadId, key, sceneId });
  } catch (err) {
    console.error("upload-init error", err);
    return response(500, { error: "Internal server error" });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
