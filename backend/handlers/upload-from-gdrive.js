"use strict";

const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { LambdaClient, InvokeCommand }    = require("@aws-sdk/client-lambda");
const { randomUUID }                     = require("crypto");
const response                           = require("../lib/response");

const dynamo = new DynamoDBClient({});
const lambda = new LambdaClient({});

const TABLE            = process.env.SCENES_TABLE_NAME;
const GDRIVE_IMPORT_FN = process.env.GDRIVE_IMPORT_FUNCTION_NAME;
const PENDING_TTL_S    = 24 * 60 * 60; // 24 hours — matches init.js

// Only accept `https://drive.google.com/` — no HTTP, no other hosts (SSRF guard).
// The three accepted path shapes cover virtually all public share link formats.
const GDRIVE_URL_RE    = /^https:\/\/drive\.google\.com\/(file\/d\/([A-Za-z0-9_-]{10,})|open\?.*\bid=([A-Za-z0-9_-]{10,})|uc\?.*\bid=([A-Za-z0-9_-]{10,}))/;
// Google Drive file IDs are alphanumeric + hyphen + underscore only.
const FILE_ID_RE       = /^[A-Za-z0-9_-]{10,}$/;

function extractFileId(url) {
  const m = url.match(GDRIVE_URL_RE);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? null;
}

/**
 * POST /upload/from-gdrive
 *
 * Initiates a server-side import of a publicly-shared Google Drive ZIP.
 *
 * Request body:
 *   { "gdrive_url": "https://drive.google.com/file/d/<ID>/view?...", "name"?: "My Scene" }
 *
 * Success response (202):
 *   { "sceneId": "...", "status": "PENDING_UPLOAD" }
 *
 * The caller should poll GET /scenes/{sceneId} as it does after a normal upload.
 * The background gdrive-import Lambda transitions the scene to UPLOADED once the
 * download completes, at which point it can be submitted for 3DGS training.
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

  const { gdrive_url, name } = body;

  if (!gdrive_url || typeof gdrive_url !== "string" || gdrive_url.trim() === "") {
    return response(400, { error: "Missing required field: gdrive_url" });
  }

  const fileId = extractFileId(gdrive_url.trim());
  if (!fileId || !FILE_ID_RE.test(fileId)) {
    return response(400, {
      error:
        "Invalid Google Drive URL. Share the file publicly and paste the share link " +
        "(e.g. https://drive.google.com/file/d/<ID>/view?usp=sharing).",
    });
  }

  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    return response(400, { error: "name must be a non-empty string when provided" });
  }

  const sceneId     = randomUUID();
  const filename    = `gdrive-${fileId}.zip`;
  const key         = `users/${userId}/${sceneId}-${filename}`;
  const nowMs       = Date.now();
  const now         = new Date(nowMs).toISOString();
  const expiresAt   = Math.floor(nowMs / 1000) + PENDING_TTL_S;
  const trimmedName = name?.trim() ?? filename;

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        scene_id:       { S: sceneId },
        user_id:        { S: userId },
        status:         { S: "PENDING_UPLOAD" },
        source_type:    { S: "gdrive" },
        gdrive_file_id: { S: fileId },
        s3_key:         { S: key },
        filename:       { S: filename },
        content_type:   { S: "application/zip" },
        input_type:     { S: "zip" },
        name:           { S: trimmedName },
        created_at:     { S: now },
        updated_at:     { S: now },
        expires_at:     { N: String(expiresAt) },
      },
      ConditionExpression: "attribute_not_exists(scene_id)",
    })
  );

  // Async invocation — API Gateway returns immediately; the import Lambda runs
  // in the background and updates the scene status when the download finishes.
  await lambda.send(
    new InvokeCommand({
      FunctionName:   GDRIVE_IMPORT_FN,
      InvocationType: "Event",
      Payload:        Buffer.from(
        JSON.stringify({ sceneId, userId, fileId, s3Key: key })
      ),
    })
  );

  return response(202, { sceneId, status: "PENDING_UPLOAD" });
};
