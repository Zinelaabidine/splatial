"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { applyProgressFields } = require("../lib/progress-fields");
const { applyLeaseClaim } = require("../lib/attempt-lease");
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
    return response(200, {
      attemptId,
      received: true,
      cancelRequested: true,
      leaseLost: false,
    });
  }

  const now        = new Date().toISOString();
  const exprParts  = ["updated_at = :now", "last_heartbeat_at = :now"];
  const exprNames  = {};
  const exprValues = { ":now": { S: now } };

  applyProgressFields(body, exprParts, exprValues);

  // Renew the lease. Until this existed, last_heartbeat_at was written on every
  // heartbeat and read by nothing — the liveness signal needed to detect a dead
  // worker was being recorded and discarded. Extending the lease here is what
  // keeps a healthy attempt out of the reaper's overdue query.
  applyLeaseClaim(exprParts, exprValues, exprNames, new Date(now));

  log.event("attempt.heartbeat", {
    attemptId,
    data: {
      phase: body.progressPhase,
      percent: body.progressPercent,
      eta_seconds: body.progressEtaSeconds,
    },
  });

  // Guarded on the attempt still being PROCESSING: a heartbeat from a worker
  // the reaper has already given up on must not silently re-claim the lease
  // while a replacement is running. The worker_token check above is the primary
  // fence (the reaper rotates it); this closes the window before that lands.
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: attemptId } },
        UpdateExpression: "SET " + exprParts.join(", "),
        ConditionExpression: "attribute_exists(scene_id) AND #s = :processing",
        ExpressionAttributeNames: { ...exprNames, "#s": "status" },
        ExpressionAttributeValues: { ...exprValues, ":processing": { S: "PROCESSING" } },
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
    log.event("attempt.heartbeat_stale", {
      attemptId,
      data: { attempt_status: Item.status?.S ?? null },
    });
    // Tell the worker to stand down. Deliberately NOT cancelRequested: a
    // cancelled worker PATCHes CANCELLED on the way out, which here would mark
    // the attempt terminal and destroy the replacement worker's run. leaseLost
    // means "abandon quietly, write nothing, drop your message".
    return response(409, {
      attemptId,
      error: "Attempt is no longer PROCESSING; this worker no longer holds it",
      reason: "LEASE_LOST",
      cancelRequested: false,
      leaseLost: true,
    });
  }

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

  return response(200, {
    attemptId,
    received: true,
    cancelRequested: false,
    leaseLost: false,
  });
};
