"use strict";

const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient, GetItemCommand, UpdateItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");
const response = require("../lib/response");
const logger = require("../lib/logger");
const { validateTrainConfig, validateColmapConfig } = require("../lib/job-config");

const sqs   = new SQSClient({});
const dynamo = new DynamoDBClient({});
const s3    = new S3Client({});

const QUEUE_URL      = process.env.SQS_QUEUE_URL;
const TABLE          = process.env.SCENES_TABLE_NAME;
const INPUT_BUCKET   = process.env.RAW_SCENES_BUCKET_NAME;
const OUTPUT_BUCKET  = process.env.SPLAT_SCENES_BUCKET_NAME;
const API_BASE_URL   = (process.env.API_BASE_URL ?? "").replace(/\/$/, "");
const MAX_ATTEMPTS   = 3;

const SUBMITTABLE = new Set(["READY", "FAILED", "UPLOADED"]);

/**
 * POST /jobs/submit
 *
 * Re-queues an existing scene for 3DGS training. Useful for scenes in
 * READY, FAILED, or UPLOADED state.
 *
 * Request body: { "sceneId": "...", "trainConfig"?: {}, "colmapConfig"?: {} }
 *
 * When trainConfig/colmapConfig are omitted, defaults are applied (see lib/job-config.js).
 * Both are validated against a fixed allowlist — unrecognized keys or out-of-range
 * values are rejected with a 400, never silently dropped or passed through.
 *
 * Success response (202): { "sceneId": "...", "attemptId": "...", "status": "QUEUED" }
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "submit-job");
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const { sceneId, trainConfig, colmapConfig } = body;
  if (!sceneId) return response(400, { error: "Missing required field: sceneId" });

  const trainResult = validateTrainConfig(trainConfig);
  if (!trainResult.ok) {
    return response(400, { error: "Invalid trainConfig", details: trainResult.errors });
  }
  const resolvedTrainConfig = trainResult.value;

  const colmapResult = validateColmapConfig(colmapConfig);
  if (!colmapResult.ok) {
    return response(400, { error: "Invalid colmapConfig", details: colmapResult.errors });
  }
  const resolvedColmapConfig = colmapResult.value;

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: sceneId } } })
  );

  if (!Item) return response(404, { error: "Scene not found" });
  if (Item.user_id?.S !== userId) return response(403, { error: "Forbidden" });

  const currentStatus = Item.status?.S;
  if (!SUBMITTABLE.has(currentStatus)) {
    return response(409, { error: `Scene is in ${currentStatus} state and cannot be submitted` });
  }

  const s3Key = Item.s3_key?.S;
  if (!s3Key) return response(422, { error: "No file attached to this scene. Upload a file before submitting." });

  const sceneName  = Item.name?.S ?? "";
  const inputType  = (Item.input_type?.S ?? "zip").toLowerCase();

  // Resolve file size from S3 (informational — non-fatal if unavailable)
  let inputSizeBytes = 0;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: INPUT_BUCKET, Key: s3Key }));
    inputSizeBytes = head.ContentLength ?? 0;
  } catch { /* ignore */ }

  const attemptId    = randomUUID();
  const workerToken  = randomUUID();
  const now          = new Date().toISOString();
  const outputPrefix = `${s3Key}/output/attempt-${attemptId}/`;
  const inputFileCount = inputType === "zip" ? 1 : 0;

  // Atomically transition status and increment the attempt counter
  let attemptNumber = 1;
  try {
    const updateResult = await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sceneId } },
        UpdateExpression:
          "SET #s = :queued, updated_at = :now, worker_token = :token, last_attempt_id = :attemptId ADD attempt_count :one",
        ConditionExpression: "#s IN (:r1, :r2, :r3)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":queued":    { S: "QUEUED" },
          ":now":       { S: now },
          ":token":     { S: workerToken },
          ":attemptId": { S: attemptId },
          ":one":       { N: "1" },
          ":r1":        { S: "READY" },
          ":r2":        { S: "FAILED" },
          ":r3":        { S: "UPLOADED" },
        },
        ReturnValues: "ALL_NEW",
      })
    );
    attemptNumber = Number(updateResult.Attributes?.attempt_count?.N ?? 1);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "Scene status changed before update; refresh and try again" });
    }
    throw err;
  }

  // Write the attempt record BEFORE enqueueing so a fast worker cannot receive
  // the SQS message and PATCH /api/attempts/:attemptId before this row exists
  // (that race produced 404 → 3 receive cycles → DLQ with no training run).
  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        scene_id:        { S: attemptId },       // PK — intentionally the attemptId
        record_type:     { S: "attempt" },
        parent_scene_id: { S: sceneId },
        user_id:         { S: userId },
        attempt_number:  { N: String(attemptNumber) },
        status:          { S: "QUEUED" },
        worker_token:    { S: workerToken },
        created_at:      { S: now },
        updated_at:      { S: now },
        // Stored as JSON strings (not DynamoDB Map) so the resolved config is
        // trivial to display as-is and to diff between attempts/reruns.
        train_config:    { S: JSON.stringify(resolvedTrainConfig) },
        colmap_config:   { S: JSON.stringify(resolvedColmapConfig) },
      },
    })
  );

  log.event("attempt.created", {
    sceneId,
    attemptId,
    data: { attempt_number: attemptNumber },
  });

  await sqs.send(
    new SendMessageCommand({
      QueueUrl:    QUEUE_URL,
      MessageBody: JSON.stringify({
        sceneId,
        attemptId,
        userId,
        sceneName,
        attemptNumber,
        inputBucket:    INPUT_BUCKET,
        inputPrefix:    s3Key,
        inputFileType:  inputType,
        inputFileCount,
        inputSizeBytes,
        outputBucket:   OUTPUT_BUCKET,
        outputPrefix,
        apiBaseUrl:     API_BASE_URL,
        apiAuthToken:   workerToken,
        queuedAt:       now,
        maxAttempts:    MAX_ATTEMPTS,
        trainConfig:    resolvedTrainConfig,
        colmapConfig:   resolvedColmapConfig,
      }),
    })
  );

  log.event("job.queued", { attemptId, data: { queue: QUEUE_URL } });
  log.event("job.submitted", {
    sceneId,
    attemptId,
    data: {
      attempt_number: attemptNumber,
      train_config: resolvedTrainConfig,
      colmap_config: resolvedColmapConfig,
    },
  });

  return response(202, { sceneId, attemptId, status: "QUEUED" });
};
