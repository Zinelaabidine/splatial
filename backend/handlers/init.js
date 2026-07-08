"use strict";

const { S3Client, CreateMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");
const response = require("../lib/response");
const { getUserTier } = require("../lib/user-tier");
const { getStorageCapBytes, getStorageUsedBytes } = require("../lib/storage-quota");
const { getUserStatus, blockReasonForNewWork } = require("../lib/account-status");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const TABLE = process.env.SCENES_TABLE_NAME;
// TTL for PENDING_UPLOAD records (DynamoDB will auto-delete after this).
const PENDING_TTL_S = 24 * 60 * 60; // 24 hours

const ALLOWED_CONTENT_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
  "application/octet-stream",
  "video/mp4",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/zip",
  "application/x-zip-compressed",
]);

const ZIP_CONTENT_TYPES   = new Set(["application/zip", "application/x-zip-compressed"]);
const ALLOWED_INPUT_TYPES = new Set(["video", "images", "zip"]);

exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  // Account-standing gate: suspended/banned/deleted accounts cannot start a
  // new upload (which would eventually feed a new processing job).
  const accountStatus = await getUserStatus(dynamo, userId);
  const blockReason = blockReasonForNewWork(accountStatus);
  if (blockReason) {
    return response(403, { error: blockReason, accountStatus });
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const { filename, contentType, name, inputType, declaredSizeBytes } = body;

  if (!filename || typeof filename !== "string" || filename.trim() === "") {
    return response(400, { error: "Missing required field: filename" });
  }
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return response(415, { error: "Unsupported content type", allowed: [...ALLOWED_CONTENT_TYPES] });
  }
  // Automatically resolve zip from content type regardless of the inputType hint
  const resolvedInputType = ZIP_CONTENT_TYPES.has(contentType)
    ? "zip"
    : (inputType ?? undefined);

  if (resolvedInputType !== undefined && !ALLOWED_INPUT_TYPES.has(resolvedInputType)) {
    return response(400, { error: "inputType must be 'video', 'images', or 'zip'" });
  }
  if (
    typeof declaredSizeBytes !== "number" ||
    !Number.isFinite(declaredSizeBytes) ||
    declaredSizeBytes <= 0
  ) {
    return response(400, { error: "Missing or invalid required field: declaredSizeBytes" });
  }

  // Soft gate on the client-declared size — blocks obviously-over-cap uploads
  // before any S3 multipart upload starts. This trusts the client, so it's
  // not the real enforcement: complete.js re-measures the actual uploaded
  // size via HeadObject and rejects there too (defense in depth).
  const tier = await getUserTier(dynamo, userId);
  const capBytes = getStorageCapBytes(tier);
  const usedBytes = await getStorageUsedBytes(dynamo, userId);
  if (usedBytes + declaredSizeBytes > capBytes) {
    return response(413, {
      error: "This upload would exceed your storage allowance",
      tier,
      capBytes,
      usedBytes,
      declaredSizeBytes,
    });
  }

  const sceneId = randomUUID();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const key = `users/${userId}/${sceneId}-${safeFilename}`;

  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
      Metadata: { "user-id": userId, "scene-id": sceneId },
    })
  );

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const expiresAt = Math.floor(nowMs / 1000) + PENDING_TTL_S;

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        scene_id:    { S: sceneId },
        user_id:     { S: userId },
        status:      { S: "PENDING_UPLOAD" },
        upload_id:   { S: UploadId },
        s3_key:      { S: key },
        filename:    { S: safeFilename },
        content_type: { S: contentType },
        created_at:  { S: now },
        updated_at:  { S: now },
        expires_at:  { N: String(expiresAt) },
        // Optional scene-management fields (stored when provided by the dashboard).
        ...(name && typeof name === "string" && name.trim()
          ? { name: { S: name.trim() } }
          : {}),
        ...(resolvedInputType && ALLOWED_INPUT_TYPES.has(resolvedInputType)
          ? { input_type: { S: resolvedInputType } }
          : {}),
      },
      ConditionExpression: "attribute_not_exists(scene_id)",
    })
  );

  return response(200, { uploadId: UploadId, key, sceneId });
};
