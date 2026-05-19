"use strict";

const { S3Client, UploadPartCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const response = require("../lib/response");

const s3 = new S3Client({});

const BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const PRESIGN_TTL_SECONDS = 3600; // 1 hour
const MAX_PARTS = 100;

/**
 * POST /upload/presign
 *
 * Request body:
 *   { "uploadId": "...", "key": "uploads/<userId>/...", "partCount": 3 }
 *
 * Success response (200):
 *   { "parts": [{ "partNumber": 1, "url": "https://..." }, ...], "expiresIn": 3600 }
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

  const { uploadId, key, partCount } = body;

  if (!uploadId || typeof uploadId !== "string") {
    return response(400, { error: "Missing required field: uploadId" });
  }
  if (!key || typeof key !== "string") {
    return response(400, { error: "Missing required field: key" });
  }
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > MAX_PARTS) {
    return response(400, { error: `partCount must be an integer between 1 and ${MAX_PARTS}` });
  }

  // Verify the key belongs to this user (key format: uploads/<userId>/...)
  if (!key.startsWith(`uploads/${userId}/`)) {
    return response(403, { error: "Forbidden: key does not belong to this user" });
  }

  const parts = await Promise.all(
    Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_TTL_SECONDS });
      return { partNumber, url };
    })
  );

  return response(200, { parts, expiresIn: PRESIGN_TTL_SECONDS });
};
