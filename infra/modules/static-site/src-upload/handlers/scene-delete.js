"use strict";

const {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  ScanCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  deleteObjectsUnderPrefix,
  deleteObjectIfPresent,
  abortMultipartUploadIfPresent,
  S3Client,
} = require("../lib/s3-cleanup");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});

const TABLE = process.env.SCENES_TABLE_NAME;
const RAW_BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const OUTPUT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;

const ACTIVE_STATUSES = new Set(["QUEUED", "PROCESSING", "PENDING_UPLOAD", "UPLOADING", "VALIDATING"]);

/**
 * DELETE /scenes/{sceneId}
 * DELETE /api/v1/scenes/{sceneId}
 *
 * Permanently removes a scene owned by the caller:
 *   - Marks in-flight jobs CANCELLED (worker skips / SQS message becomes a no-op)
 *   - Aborts incomplete multipart uploads
 *   - Deletes raw input objects and all output artifacts from S3
 *   - Deletes related attempt records from DynamoDB
 *   - Deletes the scene record from DynamoDB
 *
 * SQS messages already in flight cannot be removed directly; cancelling + deleting
 * attempt/scene records ensures workers exit without writing new artifacts.
 *
 * Success response (200):
 *   { "sceneId": "...", "deleted": true, "cancelledJob": boolean }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = existing.Item;
  if (!item) return response(404, { error: "Scene not found" });

  if (item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  const logContext = { sceneId, userId };
  const currentStatus = item.status?.S ?? "";
  let cancelledJob = false;

  if (ACTIVE_STATUSES.has(currentStatus)) {
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: sceneId } },
          UpdateExpression: "SET #s = :cancelled, updated_at = :now",
          ConditionExpression: "user_id = :uid",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":cancelled": { S: "CANCELLED" },
            ":now": { S: new Date().toISOString() },
            ":uid": { S: userId },
          },
        })
      );
      cancelledJob = true;
    } catch (err) {
      console.warn("scene cancel before delete skipped", { ...logContext, err: err.message });
    }
  }

  const s3Key = item.s3_key?.S ?? item.s3_location?.S ?? null;
  const uploadId = item.upload_id?.S ?? null;
  const outputBucket = item.output_bucket?.S ?? OUTPUT_BUCKET;
  const outputPrefix = item.output_prefix?.S ?? null;
  const plyKey = item.ply_key?.S ?? null;
  const lastAttemptId = item.last_attempt_id?.S ?? null;

  if (s3Key && !s3Key.startsWith(`users/${userId}/`)) {
    return response(403, { error: "Forbidden: scene storage key does not belong to this user" });
  }

  if (uploadId && s3Key) {
    await abortMultipartUploadIfPresent(s3, RAW_BUCKET, s3Key, uploadId, logContext);
  }

  if (s3Key) {
    await deleteObjectIfPresent(s3, RAW_BUCKET, s3Key, logContext);
    await deleteObjectsUnderPrefix(
      s3,
      RAW_BUCKET,
      `users/${userId}/${sceneId}`,
      logContext
    );
  }

  const outputPrefixes = new Set();
  if (outputPrefix) outputPrefixes.add(outputPrefix);
  if (s3Key) outputPrefixes.add(`${s3Key}/output`);
  if (plyKey) {
    await deleteObjectIfPresent(s3, outputBucket, plyKey, logContext);
    const plyDir = plyKey.includes("/")
      ? plyKey.slice(0, plyKey.lastIndexOf("/") + 1)
      : null;
    if (plyDir) outputPrefixes.add(plyDir);
  }
  outputPrefixes.add(`splat-scenes/${userId}/${sceneId}`);

  for (const prefix of outputPrefixes) {
    await deleteObjectsUnderPrefix(s3, outputBucket, prefix, logContext);
  }

  const attemptIds = new Set();
  if (lastAttemptId) attemptIds.add(lastAttemptId);

  let scanStartKey;
  do {
    const scanResult = await dynamo.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "parent_scene_id = :sid AND record_type = :attempt",
        ExpressionAttributeValues: {
          ":sid": { S: sceneId },
          ":attempt": { S: "attempt" },
        },
        ExclusiveStartKey: scanStartKey,
      })
    );

    for (const attemptItem of scanResult.Items ?? []) {
      const attemptId = attemptItem.scene_id?.S;
      if (attemptId) attemptIds.add(attemptId);
    }

    scanStartKey = scanResult.LastEvaluatedKey;
  } while (scanStartKey);

  for (const attemptId of attemptIds) {
    try {
      await dynamo.send(
        new DeleteItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: attemptId } },
        })
      );
    } catch (err) {
      console.warn("attempt delete skipped", { ...logContext, attemptId, err: err.message });
    }
  }

  await dynamo.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      ConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": { S: userId } },
    })
  );

  return response(200, { sceneId, deleted: true, cancelledJob });
};
