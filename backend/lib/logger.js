"use strict";

/**
 * Structured JSON logging for backend Lambda handlers.
 *
 * Conforms to docs/logging-and-observability.md — the shared envelope, the event
 * vocabulary, and the redaction rules. Emits one JSON line per call to stdout,
 * which Lambda forwards to the function's CloudWatch log group.
 *
 * Usage in a handler:
 *
 *   const logger = require("../lib/logger");
 *   exports.handler = async (event) => {
 *     const log = logger.forEvent(event, "submit-job");
 *     log.event("job.submitted", {
 *       sceneId, attemptId,
 *       data: { attempt_number, train_config },
 *     });
 *     ...
 *     log.error("attempt.failed", { attemptId, data: { reason } });
 *   };
 */

const SCHEMA_VERSION = 1;
const SERVICE = "backend";
const ENV = process.env.SPLATIAL_ENV || process.env.ENVIRONMENT || "dev";

// Keys whose values must never be logged (see logging spec §8). Lower-cased.
const SECRET_KEYS = new Set([
  "token",
  "api_auth_token",
  "apiauthtoken",
  "worker_token",
  "workertoken",
  "authorization",
  "password",
  "secret",
  "signature",
  "api_token",
  "bearer",
]);

// Presigned S3 URLs / anything carrying an AWS signature.
const SIGNED_URL_RE =
  /https?:\/\/[^\s"']+[?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=[^\s"'&]+/gi;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.has(String(k).toLowerCase())
        ? "[REDACTED]"
        : redact(v);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.replace(SIGNED_URL_RE, "[REDACTED_URL]");
  }
  return value;
}

/**
 * Build a logger bound to one request. `handler` is a short name for ctx.handler
 * (e.g. "submit-job").
 */
function forEvent(event, handler) {
  const requestId = event?.requestContext?.requestId;
  const ctx = { handler, ...(requestId ? { request_id: requestId } : {}) };

  function emit(level, eventName, fields = {}) {
    const { sceneId, attemptId, data, msg } = fields;
    const line = {
      schema_version: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      env: ENV,
      event: eventName,
      ...(sceneId ? { scene_id: sceneId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      ctx,
      ...(data ? { data: redact(data) } : {}),
      ...(msg ? { msg: String(msg).replace(SIGNED_URL_RE, "[REDACTED_URL]") } : {}),
    };
    const out = JSON.stringify(line);
    if (level === "error") console.error(out);
    else if (level === "warning") console.warn(out);
    else console.log(out);
  }

  return {
    event: (name, fields) => emit("info", name, fields),
    warn: (name, fields) => emit("warning", name, fields),
    error: (name, fields) => emit("error", name, fields),
  };
}

module.exports = { forEvent, redact };
