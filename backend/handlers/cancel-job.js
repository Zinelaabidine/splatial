"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const logger = require("../lib/logger");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

/**
 * POST /jobs/{sceneId}/cancel
 *
 * Transitions a QUEUED or PROCESSING scene to CANCELLED and marks the live
 * attempt CANCELLED with cancel_requested = true.
 *
 * Cancellation is a soft-invalidate, because SQS cannot delete a specific
 * message that has not been received. Three layers act on the flag:
 *
 *   1. Durable truth (here)   — attempt status CANCELLED + cancel_requested.
 *   2. Ignore-on-consume      — the worker's opening PATCH gets a 409 and the
 *                               worker deletes the message without training.
 *   3. Stop-in-flight         — attempt-heartbeat.js returns cancelRequested,
 *                               and the worker stops within one interval.
 *
 * Success response (200): { "sceneId": "...", "attemptId": "...", "status": "CANCELLED" }
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "cancel-job");
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: sceneId } } })
  );
  if (!Item) return response(404, { error: "Scene not found" });
  if (Item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  const lastAttemptId = Item.last_attempt_id?.S ?? null;
  const now = new Date().toISOString();

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sceneId } },
        UpdateExpression: "SET #s = :cancelled, updated_at = :now",
        ConditionExpression: "user_id = :uid AND #s IN (:q, :p)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":cancelled": { S: "CANCELLED" },
          ":now":        { S: now },
          ":uid":        { S: userId },
          ":q":          { S: "QUEUED" },
          ":p":          { S: "PROCESSING" },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "Scene not in a cancellable state" });
    }
    throw err;
  }

  let attemptCancelled = false;
  if (lastAttemptId) {
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: lastAttemptId } },
          UpdateExpression:
            "SET #s = :cancelled, updated_at = :now, cancel_requested = :true, cancel_requested_at = :now",
          ConditionExpression: "#s IN (:q, :p)",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":cancelled": { S: "CANCELLED" },
            ":now":        { S: now },
            ":true":       { BOOL: true },
            ":q":          { S: "QUEUED" },
            ":p":          { S: "PROCESSING" },
          },
        })
      );
      attemptCancelled = true;
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
      // The attempt already reached a terminal state (SUCCEEDED/FAILED) between
      // the scene update above and this write. The scene is CANCELLED either
      // way; there is simply no live attempt left to signal.
      log.event("job.cancel_attempt_already_terminal", {
        sceneId,
        data: { attempt_id: lastAttemptId },
      });
    }
  }

  log.event("job.cancelled", {
    sceneId,
    data: { attempt_id: lastAttemptId, attempt_cancelled: attemptCancelled },
  });

  return response(200, {
    sceneId,
    attemptId: lastAttemptId,
    status: "CANCELLED",
    attemptCancelled,
  });
};
