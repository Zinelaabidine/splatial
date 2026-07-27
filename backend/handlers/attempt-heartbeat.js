"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { applyProgressFields } = require("../lib/progress-fields");
const logger = require("../lib/logger");

const dynamo = new DynamoDBClient({});
const TABLE  = process.env.SCENES_TABLE_NAME;

/**
 * POST /api/attempts/:attemptId/heartbeat
 *
 * Called by the EC2 worker to report liveness and progress. Auth via
 * per-job worker token sent as Bearer token.
 *
 * Body: {
 *   progressPhase, progressPercent,
 *   progressSubPhase?, progressEtaSeconds?
 * }
 *
 * Response: { attemptId, received, cancelRequested }
 *
 * cancelRequested is the cancel-delivery channel for an actively-processing
 * worker. The worker already calls this every HEARTBEAT_INTERVAL_SECONDS and
 * already authenticates here, so no extra polling endpoint is needed; on a
 * true value the worker stops as if Spot-interrupted and deletes its message.
 * Cancellation latency is therefore bounded by one heartbeat interval.
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "attempt-heartbeat");
  const attemptId = event.pathParameters?.attemptId;
  if (!attemptId) return response(400, { error: "Missing attemptId" });

  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const workerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!workerToken) return response(401, { error: "Missing Authorization header" });

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: attemptId } } })
  );
  if (!Item) return response(404, { error: "Scene not found" });
  if (Item.worker_token?.S !== workerToken) return response(403, { error: "Invalid worker token" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  // Answer the liveness call with the stop signal before doing any progress
  // bookkeeping: a cancelled attempt's progress is not worth recording, and
  // writing it would keep a cancelled scene's card animating.
  const cancelRequested =
    Item.status?.S === "CANCELLED" || Item.cancel_requested?.BOOL === true;

  if (cancelRequested) {
    log.event("attempt.heartbeat_cancel_signalled", {
      attemptId,
      data: { attempt_status: Item.status?.S ?? null },
    });
    return response(200, { attemptId, received: true, cancelRequested: true });
  }

  const now        = new Date().toISOString();
  const exprParts  = ["updated_at = :now", "last_heartbeat_at = :now"];
  const exprValues = { ":now": { S: now } };

  applyProgressFields(body, exprParts, exprValues);

  log.event("attempt.heartbeat", {
    attemptId,
    data: {
      phase: body.progressPhase,
      percent: body.progressPercent,
      eta_seconds: body.progressEtaSeconds,
    },
  });

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: "SET " + exprParts.join(", "),
      ExpressionAttributeValues: exprValues,
    })
  );

  // Cascade progress to parent scene (same as attempt-patch) so dashboard polling sees updates.
  const parentSceneId = Item.parent_scene_id?.S;
  const hasProgress = body && (
    body.progressPhase
    || typeof body.progressPercent === "number"
    || body.progressSubPhase
    || typeof body.progressEtaSeconds === "number"
  );
  if (parentSceneId && hasProgress) {
    const parentParts  = ["updated_at = :now", "last_heartbeat_at = :now"];
    const parentValues = { ":now": { S: now } };

    applyProgressFields(body, parentParts, parentValues);

    // Guarded for the same reason as attempt-patch.js's cascade: without it,
    // heartbeat progress writes keep a cancelled scene looking alive.
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: parentSceneId } },
          UpdateExpression: "SET " + parentParts.join(", "),
          ConditionExpression: "attribute_exists(scene_id) AND #st <> :cancelled",
          ExpressionAttributeNames: { "#st": "status" },
          ExpressionAttributeValues: { ...parentValues, ":cancelled": { S: "CANCELLED" } },
        })
      );
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
      // Scene was cancelled or deleted mid-flight. The next heartbeat will
      // read the attempt's own CANCELLED status and return the stop signal.
      log.event("attempt.heartbeat_cascade_skipped", {
        attemptId,
        sceneId: parentSceneId,
      });
    }
  }

  return response(200, { attemptId, received: true, cancelRequested: false });
};
