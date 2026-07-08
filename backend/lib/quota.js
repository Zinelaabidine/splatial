"use strict";

const { QueryCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

/**
 * Rolling-window job quota ledger (backed by the job_quota_events table).
 *
 * Two call sites write here, and both represent a deliberate, user-driven
 * consumption of the weekly slot:
 *   - submit-job.js, at submit time, when a scene already has a prior
 *     attempt (FAILED or READY -> resubmitted) — a manual retry, charged
 *     immediately regardless of this attempt's eventual outcome.
 *   - attempt-patch.js, when the worker reports SUCCEEDED on a scene's
 *     first-ever attempt — charged only on success, and only if the attempt
 *     wasn't already charged as a manual retry (see is_manual_retry).
 *
 * Auto-requeues from an INTERRUPTED (Spot-preempted) attempt never reach
 * either call site as a fresh charge: attempt-patch.js's STATUS_MAP resolves
 * INTERRUPTED to QUEUED, not SUCCEEDED, so no event is written.
 */

const QUOTA_EVENT_TYPES = new Set(["COMPLETION", "MANUAL_RETRY"]);

const WINDOW_DAYS = 7;

// Buffer past the enforcement window so DynamoDB's TTL deletion lag (up to
// ~48h) can never reap a row the rolling-window query still needs to count.
const TTL_BUFFER_DAYS = 2;

/**
 * Count quota-consuming events for a user in the trailing `windowDays`.
 *
 * event_sk is "QUOTA#<ISO-8601 UTC timestamp>#<attemptId>", which sorts
 * lexicographically in the same order as chronologically (fixed-width UTC
 * ISO strings), so a single Query with Select=COUNT answers this directly —
 * no GSI, no scan.
 */
async function getRollingWindowCount(dynamo, userId, windowDays = WINDOW_DAYS) {
  const table = process.env.JOB_QUOTA_EVENTS_TABLE_NAME;
  const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { Count } = await dynamo.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "user_id = :uid AND event_sk >= :cutoff",
      ExpressionAttributeValues: {
        ":uid":    { S: userId },
        ":cutoff": { S: `QUOTA#${cutoffIso}` },
      },
      Select: "COUNT",
    })
  );

  return Count ?? 0;
}

/** Record a single quota-consuming event. */
async function recordQuotaEvent(dynamo, userId, { eventType, attemptId, sceneId }) {
  if (!QUOTA_EVENT_TYPES.has(eventType)) {
    throw new Error(`Invalid quota event_type: ${eventType}`);
  }
  if (!userId || !attemptId || !sceneId) {
    throw new Error("recordQuotaEvent requires userId, attemptId, and sceneId");
  }

  const table = process.env.JOB_QUOTA_EVENTS_TABLE_NAME;
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = Math.floor(now.getTime() / 1000) + (WINDOW_DAYS + TTL_BUFFER_DAYS) * 24 * 60 * 60;

  await dynamo.send(
    new PutItemCommand({
      TableName: table,
      Item: {
        user_id:    { S: userId },
        event_sk:   { S: `QUOTA#${nowIso}#${attemptId}` },
        event_type: { S: eventType },
        attempt_id: { S: attemptId },
        scene_id:   { S: sceneId },
        created_at: { S: nowIso },
        expires_at: { N: String(expiresAt) },
      },
    })
  );
}

module.exports = { getRollingWindowCount, recordQuotaEvent, QUOTA_EVENT_TYPES, WINDOW_DAYS };
