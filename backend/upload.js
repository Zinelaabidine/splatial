"use strict";

const init              = require("./handlers/init");
const presign           = require("./handlers/presign");
const complete          = require("./handlers/complete");
const uploadFromGdrive  = require("./handlers/upload-from-gdrive");
const sceneStatus = require("./handlers/scene-status");
const sceneDelete = require("./handlers/scene-delete");
const sceneCreate = require("./handlers/scene-create");
const scenesList  = require("./handlers/scenes-list");
const sceneSeed   = require("./handlers/scene-seed");
const sceneViewUrl = require("./handlers/scene-view-url");
const sceneUpdate = require("./handlers/scene-update");
const sceneThumbnailPresign = require("./handlers/scene-thumbnail-presign");
const submitJob        = require("./handlers/submit-job");
const cancelJob        = require("./handlers/cancel-job");
const attemptPatch     = require("./handlers/attempt-patch");
const attemptHeartbeat = require("./handlers/attempt-heartbeat");
const adminAttemptsList = require("./handlers/admin-attempts-list");
const adminAttemptsLogs = require("./handlers/admin-attempts-logs");
const profileGetMe = require("./handlers/profile-get-me");
const profileUpdateMe = require("./handlers/profile-update-me");
const profileGetByUsername = require("./handlers/profile-get-by-username");
const followCreate = require("./handlers/follow-create");
const followDelete = require("./handlers/follow-delete");
const profileScenesList = require("./handlers/profile-scenes-list");
const profileUsernameAvailable = require("./handlers/profile-username-available");
const feedList = require("./handlers/feed-list");
const exploreList = require("./handlers/explore-list");
const reactionSet = require("./handlers/reaction-set");
const reactionDelete = require("./handlers/reaction-delete");
const commentCreate = require("./handlers/comment-create");
const commentsList = require("./handlers/comments-list");
const commentDelete = require("./handlers/comment-delete");
const notificationsList = require("./handlers/notifications-list");
const notificationsRead = require("./handlers/notifications-read");
const notificationsUnreadCount = require("./handlers/notifications-unread-count");
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
      case "POST /upload/from-gdrive":
        return await uploadFromGdrive.handler(event);

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
      case "POST /api/v1/scenes/seed":
        return await sceneSeed.handler(event);
      case "GET /api/v1/scenes/{sceneId}/view-url":
        return await sceneViewUrl.handler(event);
      case "PATCH /api/v1/scenes/{sceneId}":
        return await sceneUpdate.handler(event);
      case "POST /api/v1/scenes/{sceneId}/thumbnail/presign":
        return await sceneThumbnailPresign.handler(event);

      // ── User Profiles ─────────────────────────────────────────────────
      case "GET /api/v1/profile/me":
        return await profileGetMe.handler(event);
      case "PUT /api/v1/profile/me":
        return await profileUpdateMe.handler(event);
      case "GET /api/v1/profiles/{username}":
        return await profileGetByUsername.handler(event);
      case "POST /api/v1/profiles/{username}/follow":
        return await followCreate.handler(event);
      case "DELETE /api/v1/profiles/{username}/follow":
        return await followDelete.handler(event);
      case "GET /api/v1/profiles/{username}/scenes":
        return await profileScenesList.handler(event);
      case "GET /api/v1/profile/username-available/{username}":
        return await profileUsernameAvailable.handler(event);
      case "GET /api/v1/feed":
        return await feedList.handler(event);
      case "GET /api/v1/explore":
        return await exploreList.handler(event);
      case "PUT /api/v1/scenes/{sceneId}/reaction":
        return await reactionSet.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}/reaction":
        return await reactionDelete.handler(event);
      case "POST /api/v1/scenes/{sceneId}/comments":
        return await commentCreate.handler(event);
      case "GET /api/v1/scenes/{sceneId}/comments":
        return await commentsList.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}/comments/{commentId}":
        return await commentDelete.handler(event);

      // ── Notifications ────────────────────────────────────────────────
      case "GET /api/v1/notifications":
        return await notificationsList.handler(event);
      case "POST /api/v1/notifications/read":
        return await notificationsRead.handler(event);
      case "GET /api/v1/notifications/unread-count":
        return await notificationsUnreadCount.handler(event);

      // ── Admin (admin-group gated inside the handler) ─────────────────────
      case "GET /admin/attempts":
        return await adminAttemptsList.handler(event);
      case "GET /admin/attempts/{attemptId}/logs":
        return await adminAttemptsLogs.handler(event);

      default:
        return response(404, { error: "Not found" });
    }
  } catch (err) {
    console.error("unhandled error", { route: event.routeKey, err });
    return response(500, { error: "Internal server error" });
  }
};
