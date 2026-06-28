"use strict";

const {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} = require("@aws-sdk/client-cloudwatch-logs");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");

const logs = new CloudWatchLogsClient({});
const WORKER_LOG_GROUP = process.env.WORKER_LOG_GROUP; // e.g. /splatial/dev/worker

const DEFAULT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000; // hard cap (≈ retention)
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/** Accept epoch-ms or ISO-8601; fall back when absent/invalid. */
function parseTime(v, fallback) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 0) return n;
  const d = Date.parse(v);
  return Number.isNaN(d) ? fallback : d;
}

/**
 * GET /admin/attempts/{attemptId}/logs
 *
 * Admin-only. Returns the structured log lines for one attempt by filtering the
 * worker log group on the JSON field `attempt_id`. Bounded by a time window and
 * paginated — never an open-ended, all-time scan (CloudWatch bills per GB
 * scanned). The per-job worker_token never appears in these logs (redacted at
 * source, see logging spec §8).
 *
 * Query:
 *   from, to     epoch-ms or ISO; default = last 14 days, capped at 31 days.
 *   level        optional: only lines at this level (info|warning|error|debug).
 *   limit        1..500 (default 200).
 *   nextToken    opaque pagination token from a previous response.
 *
 * Success (200): { lines: [...], nextToken?: "..." }
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }
  if (!WORKER_LOG_GROUP) {
    return response(500, { error: "Log group not configured (WORKER_LOG_GROUP)" });
  }

  const attemptId = event.pathParameters?.attemptId;
  if (!attemptId) {
    return response(400, { error: "Missing attemptId" });
  }

  const qs = event.queryStringParameters ?? {};
  const now = Date.now();
  let startTime = parseTime(qs.from, now - DEFAULT_WINDOW_MS);
  let endTime = parseTime(qs.to, now);
  if (endTime <= startTime) endTime = startTime + DEFAULT_WINDOW_MS;
  if (endTime - startTime > MAX_WINDOW_MS) startTime = endTime - MAX_WINDOW_MS;

  const limit = Math.min(
    Math.max(parseInt(qs.limit ?? "", 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  // Build a CloudWatch JSON metric-filter pattern. attemptId is a UUID, but
  // strip quotes/backslashes defensively so the pattern can't be broken.
  const safeAttempt = String(attemptId).replace(/["\\]/g, "");
  const level =
    typeof qs.level === "string" ? qs.level.trim().toLowerCase().replace(/[^a-z]/g, "") : "";
  const filterPattern = level
    ? `{ $.attempt_id = "${safeAttempt}" && $.level = "${level}" }`
    : `{ $.attempt_id = "${safeAttempt}" }`;

  let out;
  try {
    out = await logs.send(
      new FilterLogEventsCommand({
        logGroupName: WORKER_LOG_GROUP,
        startTime,
        endTime,
        filterPattern,
        limit,
        ...(qs.nextToken ? { nextToken: qs.nextToken } : {}),
      }),
    );
  } catch (err) {
    // Group not created yet (no worker has run) — return empty, not an error.
    if (err.name === "ResourceNotFoundException") {
      return response(200, { lines: [], note: "log group not found yet" });
    }
    throw err;
  }

  const lines = (out.events ?? [])
    .map((e) => {
      let parsed = null;
      try {
        parsed = JSON.parse(e.message);
      } catch {
        /* non-JSON line */
      }
      return parsed
        ? {
            timestamp: e.timestamp,
            logStreamName: e.logStreamName,
            ts: parsed.ts ?? null,
            level: parsed.level ?? null,
            event: parsed.event ?? null,
            msg: parsed.msg ?? null,
            data: parsed.data ?? null,
          }
        : {
            timestamp: e.timestamp,
            logStreamName: e.logStreamName,
            raw: e.message,
          };
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  return response(200, {
    lines,
    ...(out.nextToken ? { nextToken: out.nextToken } : {}),
  });
};
