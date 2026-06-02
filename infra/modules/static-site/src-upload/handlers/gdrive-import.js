"use strict";

const { S3Client }           = require("@aws-sdk/client-s3");
const { Upload }             = require("@aws-sdk/lib-storage");
const {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");

const s3     = new S3Client({});
const dynamo = new DynamoDBClient({});

const BUCKET    = process.env.RAW_SCENES_BUCKET_NAME;
const TABLE     = process.env.SCENES_TABLE_NAME;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — matches CreateSceneView cap

// Use drive.usercontent.google.com (newer endpoint) with `confirm=t` so that
// the virus-scan warning page is skipped for files over ~100 MB.
const downloadUrl = (fileId) =>
  `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0&confirm=t`;

/**
 * Updates the scene status in DynamoDB.
 * The `ConditionExpression` ensures that:
 *   a) only the owning user's record is mutated, and
 *   b) we never overwrite a terminal status set by a previous retry.
 */
async function setStatus(sceneId, userId, status, location) {
  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression:
        "SET #s = :status, updated_at = :now" +
        (location ? ", s3_location = :loc" : "") +
        " REMOVE expires_at",
      ConditionExpression: "user_id = :uid AND #s = :pending",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status":  { S: status },
        ":now":     { S: now },
        ":uid":     { S: userId },
        ":pending": { S: "PENDING_UPLOAD" },
        ...(location ? { ":loc": { S: location } } : {}),
      },
    })
  );
}

/**
 * Background import worker invoked asynchronously by upload-from-gdrive.js.
 *
 * Event shape (set by the caller, not API Gateway):
 *   { "sceneId": "...", "userId": "...", "fileId": "...", "s3Key": "..." }
 *
 * Flow:
 *   1. Idempotency guard — skip if scene has already progressed.
 *   2. Fetch the public Google Drive ZIP, validate content type and size.
 *   3. Stream the response body straight into S3 via @aws-sdk/lib-storage Upload.
 *   4. Update DynamoDB to UPLOADED.
 *   5. On any error, update DynamoDB to FAILED (best-effort).
 */
exports.handler = async (event) => {
  const { sceneId, userId, fileId, s3Key } = event;

  // ── 1. Idempotency guard ───────────────────────────────────────────────────
  // Lambda retries async invocations on error. If a previous attempt already
  // completed, skip re-processing instead of overwriting a good result.
  const { Item } = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  if (!Item) {
    console.warn("[gdrive-import] scene not found, skipping", { sceneId });
    return;
  }
  if (Item.status?.S !== "PENDING_UPLOAD") {
    console.log("[gdrive-import] scene already processed, skipping", {
      sceneId,
      status: Item.status?.S,
    });
    return;
  }

  try {
    // ── 2. Fetch from Google Drive ─────────────────────────────────────────
    const res = await fetch(downloadUrl(fileId), {
      redirect: "follow",
      headers: {
        // Some Google endpoints return different content based on User-Agent.
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Google Drive responded ${res.status} ${res.statusText}. ` +
          "Ensure the file is shared publicly (Anyone with the link)."
      );
    }

    // Google returns an HTML warning/login page when the file is private or
    // when a virus-scan interstitial is shown (despite `confirm=t`).
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.startsWith("text/html")) {
      throw new Error(
        "Google Drive returned an HTML page instead of a file. " +
          "Ensure the file is shared publicly (Anyone with the link) " +
          "and the URL points to a ZIP file."
      );
    }

    // Pre-reject files we know are too large before streaming.
    const rawLength = res.headers.get("content-length");
    if (rawLength && parseInt(rawLength, 10) > MAX_BYTES) {
      throw new Error(
        `File size (${rawLength} bytes) exceeds the 500 MB limit.`
      );
    }

    // ── 3. Stream to S3 ──────────────────────────────────────────────────────
    // @aws-sdk/lib-storage's Upload handles multipart chunking automatically,
    // so we never buffer the entire file in Lambda memory.
    const upload = new Upload({
      client: s3,
      params: {
        Bucket:               BUCKET,
        Key:                  s3Key,
        Body:                 res.body,
        ContentType:          "application/zip",
        ServerSideEncryption: "AES256",
        Metadata: {
          "user-id":  userId,
          "scene-id": sceneId,
          "source":   "gdrive",
        },
      },
    });

    const result   = await upload.done();
    const location = result.Location ?? `s3://${BUCKET}/${s3Key}`;

    // ── 4. Mark UPLOADED ─────────────────────────────────────────────────────
    await setStatus(sceneId, userId, "UPLOADED", location);

    console.log("[gdrive-import] completed", { sceneId, location });
  } catch (err) {
    console.error("[gdrive-import] failed", {
      sceneId,
      fileId,
      err: err.message,
    });

    // Best-effort: ConditionalCheckFailedException is silently ignored if
    // a concurrent retry already moved the status to a terminal state.
    await setStatus(sceneId, userId, "FAILED", null).catch(() => {});
  }
};
