"use strict";

const { S3Client, CreateMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");
const response = require("../lib/response");

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
]);

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

  const { filename, contentType } = body;

  if (!filename || typeof filename !== "string" || filename.trim() === "") {
    return response(400, { error: "Missing required field: filename" });
  }
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return response(415, { error: "Unsupported content type", allowed: [...ALLOWED_CONTENT_TYPES] });
  }

  const sceneId = randomUUID();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const key = `uploads/${userId}/${sceneId}/${safeFilename}`;

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
        scene_id: { S: sceneId },
        user_id: { S: userId },
        status: { S: "PENDING_UPLOAD" },
        upload_id: { S: UploadId },
        s3_key: { S: key },
        filename: { S: safeFilename },
        content_type: { S: contentType },
        created_at: { S: now },
        updated_at: { S: now },
        expires_at: { N: String(expiresAt) },
      },
      ConditionExpression: "attribute_not_exists(scene_id)",
    })
  );

  return response(200, { uploadId: UploadId, key, sceneId });
};
