"use strict";

const {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { randomUUID } = require("crypto");
const logger = require("../lib/logger");
const { buildJobMessage, buildOutputPrefix } = require("../lib/job-message");
const { getPoolForTier, getPoolConfig } = require("../lib/worker-pool");
const {
  LEASE_GSI_NAME,
  MAX_REQUEUES,
  applyLeaseRelease,
  buildUpdateExpression,
} = require("../lib/attempt-lease");

const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const INPUT_BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const OUTPUT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const API_BASE_URL = (process.env.API_BASE_URL ?? "").replace(/\/$/, "");

const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 50;

/**
 * When true, log every action the reaper *would* take and write nothing.
 *
 * A reaper bug is unusually expensive — it can mass-requeue or mass-fail live
 * work — so this exists to run one real cycle per environment in observe-only
 * mode before letting it write. Set ATTEMPT_REAPER_DRY_RUN=false to arm it.
 */
const DRY_RUN = process.env.ATTEMPT_REAPER_DRY_RUN !== "false";

/**
 * INTERNAL /attempts/reap
 *
 * NOT an API Gateway route — invoked only by the EventBridge rule in reaper.tf
 * with a synthetic { routeKey: "INTERNAL /attempts/reap" } event, following the
 * same pattern as retention.tf / admin-notifications.tf. Nothing outside
 * EventBridge can reach this routeKey, so it needs no admin-JWT gate.
 *
 * ## What it recovers
 *
 * An attempt whose worker died without reporting. A worker that is merely
 * Spot-interrupted re-enqueues itself (worker.py's _handle_stop) and clears its
 * own lease, so it never reaches here. What does reach here is the case no
 * worker-side code can cover: a hard crash, an OOM kill, or a Spot hardware
 * termination that sends no PATCH at all. Those leave the attempt PROCESSING
 * with a lease nobody is renewing.
 *
 * Left alone, two stuck states result — both of which this fixes:
 *   - PROCESSING forever, because nothing reconciles the record.
 *   - QUEUED with no message, once maxReceiveCount (3, see sqs.tf) is exhausted
 *     and the message lands in a DLQ that has no redrive-back configured.
 *
 * ## Fencing
 *
 * Recovery rotates worker_token. Both attempt-patch.js and attempt-heartbeat.js
 * already reject a mismatched token with 403, so a worker that turns out to be
 * alive after all is locked out of writing the moment it next calls home — no
 * new coordination machinery. Its stale SQS message, if it resurfaces, fails its
 * opening PATCH and is deleted as poison. Output prefixes are attempt-scoped
 * (lib/job-message.js), so even a brief overlap writes the same bytes to the
 * same place rather than interleaving.
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event ?? {}, "attempts-reap");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const stats = { scanned: 0, requeued: 0, failed: 0, skipped: 0, errors: 0 };
  let lastEvaluatedKey;

  do {
    let page;
    try {
      page = await dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: LEASE_GSI_NAME,
          // Sparse index: only attempts actively claiming a lease appear here,
          // so this reads the overdue set directly rather than scanning.
          KeyConditionExpression: "#ls = :active AND lease_expires_at < :now",
          ExpressionAttributeNames: { "#ls": "lease_status" },
          ExpressionAttributeValues: {
            ":active": { S: "ACTIVE" },
            ":now": { S: nowIso },
          },
          Limit: PAGE_SIZE,
          ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
        })
      );
    } catch (err) {
      log.error("reaper.query_failed", { data: { error: err.message } });
      throw err;
    }

    lastEvaluatedKey = page.LastEvaluatedKey;

    for (const key of page.Items ?? []) {
      const attemptId = key.scene_id?.S;
      if (!attemptId) continue;
      stats.scanned += 1;

      try {
        const outcome = await reapOne({ attemptId, log, nowIso });
        stats[outcome] = (stats[outcome] ?? 0) + 1;
      } catch (err) {
        stats.errors += 1;
        // One bad attempt must not abort the sweep — the rest of the overdue
        // set still needs recovering this cycle.
        log.error("reaper.attempt_failed", {
          attemptId,
          data: { error: err.message },
        });
      }
    }
  } while (lastEvaluatedKey);

  log.event("reaper.swept", {
    data: { ...stats, dry_run: DRY_RUN, lease_gsi: LEASE_GSI_NAME },
  });

  return { statusCode: 200, body: JSON.stringify({ ...stats, dryRun: DRY_RUN }) };
};

/**
 * Recover a single overdue attempt.
 * @returns {Promise<"requeued"|"failed"|"skipped">}
 */
async function reapOne({ attemptId, log, nowIso }) {
  // The GSI is KEYS_ONLY, so re-read the full row. This also re-checks state as
  // of now: the index is eventually consistent, and a worker may have reported
  // in between the Query and here.
  const { Item: attempt } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: attemptId } } })
  );

  if (!attempt) {
    log.event("reaper.skipped", { attemptId, data: { reason: "attempt deleted" } });
    return "skipped";
  }

  const attemptStatus = attempt.status?.S;

  // Only a PROCESSING attempt can be stale. Anything else either finished or
  // was already recovered, and its lease is stale index data that the write
  // below would have cleared anyway.
  if (attemptStatus !== "PROCESSING") {
    log.event("reaper.skipped", {
      attemptId,
      data: { reason: "not processing", attempt_status: attemptStatus ?? null },
    });
    // Terminal attempt still carrying a lease — index entries are eventually
    // consistent, so drop it rather than reaping it on the next sweep.
    // DRY_RUN must cover this too: "writes nothing" has to mean nothing.
    if (attempt.lease_status?.S === "ACTIVE" && !DRY_RUN) {
      await releaseStaleLease(attemptId, nowIso);
    }
    return "skipped";
  }

  // Cancellation wins. Re-enqueueing a cancelled attempt would resurrect work
  // the user explicitly stopped.
  if (attempt.cancel_requested?.BOOL === true) {
    log.event("reaper.skipped", { attemptId, data: { reason: "cancel requested" } });
    if (!DRY_RUN) await releaseStaleLease(attemptId, nowIso);
    return "skipped";
  }

  const parentSceneId = attempt.parent_scene_id?.S;
  if (!parentSceneId) {
    log.event("reaper.skipped", { attemptId, data: { reason: "no parent scene" } });
    return "skipped";
  }

  const requeueCount = Number(attempt.requeue_count?.N ?? 0);

  if (requeueCount >= MAX_REQUEUES) {
    return failTerminally({ attemptId, parentSceneId, requeueCount, log, nowIso });
  }

  return requeue({ attempt, attemptId, parentSceneId, requeueCount, log, nowIso });
}

/** Drop a stale lease without otherwise touching the attempt. */
async function releaseStaleLease(attemptId, nowIso) {
  const removeParts = [];
  const names = {};
  applyLeaseRelease(removeParts, names);

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: buildUpdateExpression(["updated_at = :now"], removeParts),
      ConditionExpression: "attribute_exists(scene_id)",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: { ":now": { S: nowIso } },
    })
  );
}

/** Requeue an attempt: rotate the token, reset to QUEUED, send a fresh message. */
async function requeue({ attempt, attemptId, parentSceneId, requeueCount, log, nowIso }) {
  const { Item: scene } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: parentSceneId } } })
  );

  if (!scene) {
    log.event("reaper.skipped", { attemptId, data: { reason: "parent scene deleted" } });
    return "skipped";
  }

  // A scene the user cancelled or deleted out from under this attempt.
  const sceneStatus = scene.status?.S;
  if (sceneStatus === "CANCELLED") {
    log.event("reaper.skipped", { attemptId, data: { reason: "scene cancelled" } });
    if (!DRY_RUN) await releaseStaleLease(attemptId, nowIso);
    return "skipped";
  }

  const s3Key = scene.s3_key?.S;
  if (!s3Key) {
    log.event("reaper.skipped", { attemptId, data: { reason: "scene has no input file" } });
    return "skipped";
  }

  const tier = attempt.tier?.S ?? "free";
  const { queueUrl } = getPoolConfig(getPoolForTier(tier));
  if (!queueUrl) {
    throw new Error(`no queue URL resolved for tier ${tier}`);
  }

  const newToken = randomUUID();
  const nextRequeueCount = requeueCount + 1;
  const inputType = (scene.input_type?.S ?? "zip").toLowerCase();

  const messageBody = buildJobMessage({
    sceneId: parentSceneId,
    attemptId,
    userId: attempt.user_id?.S,
    sceneName: scene.name?.S ?? "",
    attemptNumber: Number(attempt.attempt_number?.N ?? 1),
    inputBucket: INPUT_BUCKET,
    inputPrefix: s3Key,
    inputFileType: inputType,
    inputFileCount: inputType === "zip" ? 1 : 0,
    inputSizeBytes: 0, // informational only; not worth a HeadObject on recovery
    outputBucket: OUTPUT_BUCKET,
    outputPrefix: buildOutputPrefix(s3Key, attemptId),
    apiBaseUrl: API_BASE_URL,
    apiAuthToken: newToken,
    queuedAt: nowIso,
    maxAttempts: MAX_ATTEMPTS,
    trainConfig: parseJsonAttr(attempt.train_config?.S),
    colmapConfig: parseJsonAttr(attempt.colmap_config?.S),
    requeueCount: nextRequeueCount,
    maxRequeues: MAX_REQUEUES,
  });

  if (DRY_RUN) {
    log.event("reaper.would_requeue", {
      attemptId,
      sceneId: parentSceneId,
      data: { requeue_count: nextRequeueCount, tier, queue: queueUrl },
    });
    return "requeued";
  }

  // Rotate the token and reset to QUEUED *before* enqueueing, so the new
  // message can never be picked up while the row still authorises the old
  // worker. Conditioned on the attempt still being PROCESSING, which makes the
  // whole recovery a no-op if a worker reported in during this function.
  const removeParts = [];
  const names = { "#s": "status" };
  applyLeaseRelease(removeParts, names);

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: attemptId } },
        UpdateExpression: buildUpdateExpression(
          [
            "#s = :queued",
            "updated_at = :now",
            "worker_token = :token",
            "requeue_count = :rc",
            "last_requeued_at = :now",
            "last_requeue_reason = :reason",
          ],
          removeParts
        ),
        ConditionExpression: "#s = :processing",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: {
          ":queued": { S: "QUEUED" },
          ":processing": { S: "PROCESSING" },
          ":now": { S: nowIso },
          ":token": { S: newToken },
          ":rc": { N: String(nextRequeueCount) },
          ":reason": { S: "LEASE_EXPIRED" },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // A worker reported in between the Query and now. It is alive; leave it.
      log.event("reaper.skipped", {
        attemptId,
        data: { reason: "attempt no longer PROCESSING at write time" },
      });
      return "skipped";
    }
    throw err;
  }

  await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: messageBody }));

  // Reflect QUEUED on the scene so the dashboard stops showing a phantom
  // in-progress job. Guarded so a cancel that landed concurrently still wins.
  await cascadeSceneStatus({ parentSceneId, status: "QUEUED", nowIso, log, attemptId });

  log.event("reaper.requeued", {
    attemptId,
    sceneId: parentSceneId,
    data: { requeue_count: nextRequeueCount, max_requeues: MAX_REQUEUES, tier },
  });

  return "requeued";
}

/** Give up on an attempt that has exhausted its infrastructure retries. */
async function failTerminally({ attemptId, parentSceneId, requeueCount, log, nowIso }) {
  if (DRY_RUN) {
    log.event("reaper.would_fail", {
      attemptId,
      sceneId: parentSceneId,
      data: { requeue_count: requeueCount, max_requeues: MAX_REQUEUES },
    });
    return "failed";
  }

  const removeParts = [];
  const names = { "#s": "status" };
  applyLeaseRelease(removeParts, names);

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: attemptId } },
        UpdateExpression: buildUpdateExpression(
          [
            "#s = :failed",
            "updated_at = :now",
            "failure_reason = :reason",
            "error_message = :msg",
          ],
          removeParts
        ),
        ConditionExpression: "#s = :processing",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: {
          ":failed": { S: "FAILED" },
          ":processing": { S: "PROCESSING" },
          ":now": { S: nowIso },
          ":reason": { S: "LEASE_EXPIRED" },
          ":msg": {
            S:
              `Worker stopped responding and the job was recovered ` +
              `${requeueCount} time(s) without completing.`,
          },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      log.event("reaper.skipped", {
        attemptId,
        data: { reason: "attempt no longer PROCESSING at write time" },
      });
      return "skipped";
    }
    throw err;
  }

  await cascadeSceneStatus({ parentSceneId, status: "FAILED", nowIso, log, attemptId });

  log.error("reaper.failed_terminally", {
    attemptId,
    sceneId: parentSceneId,
    data: { requeue_count: requeueCount, max_requeues: MAX_REQUEUES },
  });

  return "failed";
}

/**
 * Mirror a status onto the parent scene, refusing to overwrite a cancellation.
 * Same guard as attempt-patch.js's cascade, for the same reason.
 */
async function cascadeSceneStatus({ parentSceneId, status, nowIso, log, attemptId }) {
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: parentSceneId } },
        UpdateExpression: "SET #s = :status, updated_at = :now",
        ConditionExpression: "attribute_exists(scene_id) AND #s <> :cancelled",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": { S: status },
          ":now": { S: nowIso },
          ":cancelled": { S: "CANCELLED" },
        },
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
    log.event("reaper.scene_cascade_skipped", {
      attemptId,
      sceneId: parentSceneId,
      data: { reason: "scene cancelled or deleted" },
    });
  }
}

function parseJsonAttr(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
