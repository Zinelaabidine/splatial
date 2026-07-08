"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");
const response = require("../lib/response");
const { applyProgressFields } = require("../lib/progress-fields");
const { wantsEmailFor } = require("../lib/profile");
const { sendJobStatusEmail } = require("../lib/email");
const logger = require("../lib/logger");
const { TIER_LIMITS } = require("../lib/user-tier");
const { recordQuotaEvent } = require("../lib/quota");
const { sumObjectSizesUnderPrefix, getObjectSizeBytes, adjustStorageUsedBytes } = require("../lib/storage-quota");
const { computeRawExpiresAt } = require("../lib/retention");

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});
const TABLE  = process.env.SCENES_TABLE_NAME;
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const OUTPUT_BUCKET_ENV = process.env.SPLAT_SCENES_BUCKET_NAME;

/** Best-effort "your job finished/failed" email. Never throws. */
async function maybeSendJobStatusEmail({ ownerId, sceneId, sceneName, status, errorMessage }) {
  if (!ownerId || (status !== "READY" && status !== "FAILED")) return;
  try {
    const profileResult = await dynamo.send(
      new GetItemCommand({ TableName: PROFILES_TABLE, Key: { user_id: { S: ownerId } } })
    );
    const profile = profileResult.Item;
    const to = profile?.email?.S;
    if (!to || !wantsEmailFor(profile, "jobStatus")) return;
    await sendJobStatusEmail({ to, sceneName, sceneId, status, errorMessage });
  } catch (err) {
    console.error("job status email failed", { ownerId, sceneId, err: err.message });
  }
}

// Maps worker execution status → scene management status
const STATUS_MAP = {
  RUNNING:     "PROCESSING",
  SUCCEEDED:   "READY",
  FAILED:      "FAILED",
  INTERRUPTED: "QUEUED",  // message will be re-delivered; worker sets RUNNING again
};

/**
 * PATCH /api/attempts/:attemptId
 *
 * Called by the EC2 worker (not user-facing). Auth via per-job worker token
 * stored in DynamoDB, sent as Bearer token.
 *
 * Body fields (all optional except when driving a status transition):
 *   status, progressPhase, progressPercent, progressSubPhase, progressEtaSeconds,
 *   ec2InstanceId, spotRequestId, reason, errorMessage, outputBucket, outputPrefix
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "attempt-patch");
  const attemptId = event.pathParameters?.attemptId;
  if (!attemptId) return response(400, { error: "Missing attemptId" });

  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const workerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!workerToken) return response(401, { error: "Missing Authorization header" });

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: attemptId } } })
  );
  if (!Item) return response(404, { error: "Attempt not found" });
  if (Item.worker_token?.S !== workerToken) return response(403, { error: "Invalid worker token" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const {
    status,
    ec2InstanceId, spotRequestId,
    reason, errorMessage,
    outputBucket, outputPrefix,
    viewKey, plyKey,
  } = body;

  if (Item.status?.S === "CANCELLED" && status === "RUNNING") {
    return response(200, {
      attemptId,
      updated: false,
      skipped: true,
      reason: "CANCELLED",
    });
  }

  const resolvedViewKey =
    (typeof viewKey === "string" && viewKey.trim() !== "")
      ? viewKey.trim()
      : (typeof plyKey === "string" && plyKey.trim() !== "")
        ? plyKey.trim()
        : null;

  const now = new Date().toISOString();
  const exprParts  = ["updated_at = :now"];
  const exprNames  = {};
  const exprValues = { ":now": { S: now } };

  applyProgressFields(body, exprParts, exprValues);
  if (ec2InstanceId) {
    exprParts.push("ec2_instance_id = :ec2");
    exprValues[":ec2"] = { S: ec2InstanceId };
  }
  if (spotRequestId) {
    exprParts.push("spot_request_id = :spot");
    exprValues[":spot"] = { S: spotRequestId };
  }
  if (errorMessage) {
    exprParts.push("error_message = :errmsg");
    exprValues[":errmsg"] = { S: errorMessage };
  }
  if (reason) {
    exprParts.push("failure_reason = :reason");
    exprValues[":reason"] = { S: reason };
  }

  const mappedStatus = status && STATUS_MAP[status];
  if (mappedStatus) {
    exprParts.push("#s = :attemptStatus");
    exprNames["#s"] = "status";
    exprValues[":attemptStatus"] = { S: mappedStatus };
    if (status === "SUCCEEDED" && outputBucket && outputPrefix) {
      exprParts.push("output_bucket = :obucket, output_prefix = :oprefix");
      exprValues[":obucket"] = { S: outputBucket };
      exprValues[":oprefix"] = { S: outputPrefix };
    }
    if (status === "SUCCEEDED" && resolvedViewKey) {
      exprParts.push("ply_key = :viewkey");
      exprValues[":viewkey"] = { S: resolvedViewKey };
    }
  }

  // Populated below when status === SUCCEEDED; read again later when
  // cascading to the parent scene (declared out here since that's a
  // separate block further down in this same function).
  let outputSizeBytes = null;
  let rawExpiresAtIso = null;

  if (status === "SUCCEEDED") {
    // Size the generated output — worker.py reports no size in its PATCH
    // body, so this is measured independently, the same "informational,
    // non-fatal if unavailable" spirit as submit-job.js's input HeadObject.
    const resolvedOutputBucket = outputBucket || OUTPUT_BUCKET_ENV;
    try {
      outputSizeBytes = outputPrefix
        ? await sumObjectSizesUnderPrefix(s3, resolvedOutputBucket, outputPrefix)
        : resolvedViewKey
          ? await getObjectSizeBytes(s3, resolvedOutputBucket, resolvedViewKey)
          : 0;
    } catch (err) {
      console.warn("attempt-patch: output size measurement failed", { attemptId, err: err.message });
      outputSizeBytes = 0;
    }

    // Recomputed (not incremented) on every success, so the window always
    // measures from the most recent successful run — see lib/retention.js.
    const attemptTierForRetention = Item.tier?.S ?? "free";
    rawExpiresAtIso = computeRawExpiresAt(attemptTierForRetention);

    exprParts.push("output_size_bytes = :outsize");
    exprValues[":outsize"] = { N: String(outputSizeBytes) };
  }

  // Update the attempt record
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: attemptId } },
      UpdateExpression: "SET " + exprParts.join(", "),
      ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
      ExpressionAttributeValues: exprValues,
    })
  );

  if (mappedStatus) {
    log.event("attempt.status_changed", {
      attemptId,
      data: {
        from: Item.status?.S ?? null,
        to: status,
        mapped_status: mappedStatus,
      },
    });
    if (status === "SUCCEEDED") {
      log.event("attempt.completed", {
        attemptId,
        data: {
          output_bucket: outputBucket,
          output_prefix: outputPrefix,
          output_size_bytes: outputSizeBytes,
        },
      });

      // Charge the completion-quota event unless this attempt was already
      // charged as a manual retry at submit time (see submit-job.js) — never
      // charge both for the same attempt. Auto-requeues never reach here as
      // a fresh charge: an INTERRUPTED worker status maps to QUEUED above,
      // not SUCCEEDED.
      const attemptTier = Item.tier?.S ?? "free";
      const wasManualRetry = Item.is_manual_retry?.BOOL === true;
      if (TIER_LIMITS[attemptTier] !== null && !wasManualRetry) {
        await recordQuotaEvent(dynamo, Item.user_id?.S, {
          eventType: "COMPLETION",
          attemptId,
          sceneId: Item.parent_scene_id?.S,
        });
        log.event("quota.charged", {
          attemptId,
          data: { tier: attemptTier, event_type: "COMPLETION" },
        });
      }
    }
    if (status === "FAILED") {
      log.error("attempt.failed", {
        attemptId,
        data: { reason, error_message: errorMessage },
      });
    }
  }

  // Cascade status and progress to the parent scene when present.
  // Attempt records created by the new submit-job handler carry parent_scene_id.
  const parentSceneId = Item.parent_scene_id?.S;
  if (parentSceneId) {
    const parentParts  = ["updated_at = :now"];
    const parentNames  = {};
    const parentValues = { ":now": { S: now } };

    applyProgressFields(body, parentParts, parentValues);
    if (mappedStatus) {
      parentParts.push("#s = :sceneStatus");
      parentNames["#s"] = "status";
      parentValues[":sceneStatus"] = { S: mappedStatus };
      if (status === "SUCCEEDED" && resolvedViewKey) {
        parentParts.push("ply_key = :viewkey");
        parentValues[":viewkey"] = { S: resolvedViewKey };
        if (outputBucket && outputPrefix) {
          parentParts.push("output_bucket = :obucket, output_prefix = :oprefix");
          parentValues[":obucket"] = { S: outputBucket };
          parentValues[":oprefix"] = { S: outputPrefix };
        }
      }
    }

    if (status === "SUCCEEDED" && outputSizeBytes !== null) {
      // Re-runs of the same scene must not double-count: read what was
      // previously charged for this scene's output and apply only the delta
      // (which can be negative, if a re-run produced a smaller output).
      const parentBefore = await dynamo.send(
        new GetItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: parentSceneId } },
          ProjectionExpression: "output_size_bytes",
        })
      );
      const previousOutputSizeBytes = Number(parentBefore.Item?.output_size_bytes?.N ?? 0);
      const outputDelta = outputSizeBytes - previousOutputSizeBytes;

      parentParts.push("output_size_bytes = :outsize");
      parentValues[":outsize"] = { N: String(outputSizeBytes) };

      // rawExpiresAtIso is null for tiers with no retention (e.g. pro) — the
      // raw_retention_status/raw_expires_at pair is a sparse GSI key, so it's
      // only ever written for scenes that actually have a raw-deletion date.
      if (rawExpiresAtIso) {
        parentParts.push("raw_retention_status = :rawstatus, raw_expires_at = :rawexp");
        parentValues[":rawstatus"] = { S: "PENDING" };
        parentValues[":rawexp"] = { S: rawExpiresAtIso };
      }

      if (outputDelta !== 0) {
        await adjustStorageUsedBytes(dynamo, Item.user_id?.S, outputDelta);
      }
    }

    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: parentSceneId } },
        UpdateExpression: "SET " + parentParts.join(", "),
        ...(Object.keys(parentNames).length > 0 ? { ExpressionAttributeNames: parentNames } : {}),
        ExpressionAttributeValues: parentValues,
      })
    );
  }

  if (mappedStatus === "READY" || mappedStatus === "FAILED") {
    const ownerId = Item.user_id?.S;
    let sceneName = Item.name?.S;
    if (!sceneName && parentSceneId) {
      const parent = await dynamo.send(
        new GetItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: parentSceneId } },
          ProjectionExpression: "#nm",
          ExpressionAttributeNames: { "#nm": "name" },
        })
      );
      sceneName = parent.Item?.name?.S;
    }
    await maybeSendJobStatusEmail({
      ownerId,
      sceneId: parentSceneId || attemptId,
      sceneName,
      status: mappedStatus,
      errorMessage: errorMessage || reason,
    });
  }

  return response(200, { attemptId, updated: true });
};
