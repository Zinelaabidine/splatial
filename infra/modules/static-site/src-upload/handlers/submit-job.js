"use strict";

const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");
const response = require("../lib/response");

const sqs = new SQSClient({});
const dynamo = new DynamoDBClient({});

const QUEUE_URL    = process.env.SQS_QUEUE_URL;
const TABLE        = process.env.SCENES_TABLE_NAME;
const BUCKET       = process.env.RAW_SCENES_BUCKET_NAME;
const API_BASE_URL = (process.env.API_BASE_URL ?? "").replace(/\/$/, "");

const SUBMITTABLE = new Set(["READY", "FAILED", "UPLOADED"]);

/**
 * POST /jobs/submit
 *
 * Re-queues an existing scene for 3DGS training. Useful for scenes in
 * READY, FAILED, or UPLOADED state.
 *
 * Request body: { "sceneId": "..." }
 *
 * Success response (202): { "sceneId": "...", "status": "QUEUED" }
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

  const { sceneId } = body;
  if (!sceneId) return response(400, { error: "Missing required field: sceneId" });

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

  const workerToken  = randomUUID();
  const inputType    = Item.input_type?.S ?? "video";
  const outputPrefix = `outputs/${userId}/${sceneId}`;

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sceneId } },
        UpdateExpression: "SET #s = :queued, updated_at = :now, worker_token = :token",
        ConditionExpression: "#s IN (:r1, :r2, :r3)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":queued": { S: "QUEUED" },
          ":now":    { S: new Date().toISOString() },
          ":token":  { S: workerToken },
          ":r1":     { S: "READY" },
          ":r2":     { S: "FAILED" },
          ":r3":     { S: "UPLOADED" },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "Scene status changed before update; refresh and try again" });
    }
    throw err;
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl:    QUEUE_URL,
      MessageBody: JSON.stringify({
        attemptId:     sceneId,
        sceneId,
        userId,
        apiAuthToken:  workerToken,
        apiBaseUrl:    API_BASE_URL,
        inputBucket:   BUCKET,
        inputPrefix:   s3Key,
        inputFileType: inputType,
        outputBucket:  BUCKET,
        outputPrefix,
      }),
    })
  );

  return response(202, { sceneId, status: "QUEUED" });
};
