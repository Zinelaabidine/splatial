"use strict";

const init        = require("./handlers/init");
const presign     = require("./handlers/presign");
const complete    = require("./handlers/complete");
const sceneStatus = require("./handlers/scene-status");
const sceneDelete = require("./handlers/scene-delete");
const sceneCreate = require("./handlers/scene-create");
const scenesList  = require("./handlers/scenes-list");
const submitJob        = require("./handlers/submit-job");
const cancelJob        = require("./handlers/cancel-job");
const attemptPatch     = require("./handlers/attempt-patch");
const attemptHeartbeat = require("./handlers/attempt-heartbeat");
const response    = require("./lib/response");

exports.handler = async (event) => {
  try {
    switch (event.routeKey) {
      // ── Upload flow ──────────────────────────────────────────────────────
      case "POST /upload/init":
        return await init.handler(event);
      case "POST /upload/presign":
        return await presign.handler(event);
      case "POST /upload/complete":
        return await complete.handler(event);

      // ── Job management ───────────────────────────────────────────────────
      case "POST /jobs/submit":
        return await submitJob.handler(event);
      case "POST /jobs/{sceneId}/cancel":
        return await cancelJob.handler(event);

      // ── Worker callbacks (auth via per-job worker token) ─────────────────
      case "PATCH /api/attempts/{attemptId}":
        return await attemptPatch.handler(event);
      case "POST /api/attempts/{attemptId}/heartbeat":
        return await attemptHeartbeat.handler(event);

      // ── Legacy single-scene status / delete ───────────────────────────
      case "GET /scenes/{sceneId}":
        return await sceneStatus.handler(event);
      case "DELETE /scenes/{sceneId}":
        return await sceneDelete.handler(event);

      // ── Scene Management v1 ───────────────────────────────────────────
      case "POST /api/v1/scenes":
        return await sceneCreate.handler(event);
      case "GET /api/v1/scenes":
        return await scenesList.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}":
        return await sceneDelete.handler(event);

      default:
        return response(404, { error: "Not found" });
    }
  } catch (err) {
    console.error("unhandled error", { route: event.routeKey, err });
    return response(500, { error: "Internal server error" });
  }
};
