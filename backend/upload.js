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
const sceneEditPresign = require("./handlers/scene-edit-presign");
const sceneEditComplete = require("./handlers/scene-edit-complete");
const sceneDownloadRaw = require("./handlers/scene-download-raw");
const sceneDownloadOutput = require("./handlers/scene-download-output");
const submitJob        = require("./handlers/submit-job");
const cancelJob        = require("./handlers/cancel-job");
const attemptPatch     = require("./handlers/attempt-patch");
const attemptHeartbeat = require("./handlers/attempt-heartbeat");
const attemptsReap     = require("./handlers/attempts-reap");
const adminAttemptsList = require("./handlers/admin-attempts-list");
const adminAttemptsLogs = require("./handlers/admin-attempts-logs");
const adminAsgConfigGet = require("./handlers/admin-asg-config-get");
const adminAsgConfigUpdate = require("./handlers/admin-asg-config-update");
const adminAsgBoot = require("./handlers/admin-asg-boot");
const adminAsgRelease = require("./handlers/admin-asg-release");
const adminAsgSpotPrice = require("./handlers/admin-asg-spot-price");
const adminAsgCheckManualMode = require("./handlers/admin-asg-check-manual-mode");
const retentionSweep = require("./handlers/retention-sweep");
const accountUsage = require("./handlers/account-usage");
const adminWorkerAmisList = require("./handlers/admin-worker-amis-list");
const adminWorkerAmiRegister = require("./handlers/admin-worker-ami-register");
const adminWorkerAmiBoot = require("./handlers/admin-worker-ami-boot");
const adminWorkerAmiActivate = require("./handlers/admin-worker-ami-activate");
const adminUsersList = require("./handlers/admin-users-list");
const adminUsersGet = require("./handlers/admin-users-get");
const adminUsersStatus = require("./handlers/admin-users-status");
const adminUsersVerifyOverride = require("./handlers/admin-users-verify-override");
const adminUsersResetPassword = require("./handlers/admin-users-reset-password");
const adminUsersRevokeSessions = require("./handlers/admin-users-revoke-sessions");
const adminUsersSoftDelete = require("./handlers/admin-users-soft-delete");
const adminUsersHardDelete = require("./handlers/admin-users-hard-delete");
const adminUsersRoles = require("./handlers/admin-users-roles");
const adminUsersPlan = require("./handlers/admin-users-plan");
const adminAuditLogsList = require("./handlers/admin-audit-logs-list");
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
const commentReplyCreate = require("./handlers/comment-reply-create");
const commentRepliesList = require("./handlers/comment-replies-list");
const commentReactionSet = require("./handlers/comment-reaction-set");
const commentReactionDelete = require("./handlers/comment-reaction-delete");
const notificationsList = require("./handlers/notifications-list");
const notificationsRead = require("./handlers/notifications-read");
const notificationsUnreadCount = require("./handlers/notifications-unread-count");
const bookmarkSet = require("./handlers/bookmark-set");
const bookmarkDelete = require("./handlers/bookmark-delete");
const bookmarksList = require("./handlers/bookmarks-list");
const shotCreate = require("./handlers/shot-create");
const shotsList = require("./handlers/shots-list");
const shotGet = require("./handlers/shot-get");
const shotDelete = require("./handlers/shot-delete");
const tourCreate = require("./handlers/tour-create");
const toursList = require("./handlers/tours-list");
const tourGet = require("./handlers/tour-get");
const tourDelete = require("./handlers/tour-delete");
const forkCreate = require("./handlers/fork-create");
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
      case "POST /api/v1/scenes/{sceneId}/edit/presign":
        return await sceneEditPresign.handler(event);
      case "POST /api/v1/scenes/{sceneId}/edit/complete":
        return await sceneEditComplete.handler(event);
      case "POST /api/v1/scenes/{sceneId}/fork":
        return await forkCreate.handler(event);
      case "GET /api/v1/scenes/{sceneId}/download/raw":
        return await sceneDownloadRaw.handler(event);
      case "GET /api/v1/scenes/{sceneId}/download/output":
        return await sceneDownloadOutput.handler(event);

      // ── User Profiles ─────────────────────────────────────────────────
      case "GET /api/v1/profile/me":
        return await profileGetMe.handler(event);
      case "PUT /api/v1/profile/me":
        return await profileUpdateMe.handler(event);
      case "GET /api/v1/account/usage":
        return await accountUsage.handler(event);
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
      case "POST /api/v1/scenes/{sceneId}/comments/{commentId}/replies":
        return await commentReplyCreate.handler(event);
      case "GET /api/v1/scenes/{sceneId}/comments/{commentId}/replies":
        return await commentRepliesList.handler(event);
      case "PUT /api/v1/scenes/{sceneId}/comments/{commentId}/reaction":
        return await commentReactionSet.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}/comments/{commentId}/reaction":
        return await commentReactionDelete.handler(event);

      // ── Notifications ────────────────────────────────────────────────
      case "GET /api/v1/notifications":
        return await notificationsList.handler(event);
      case "POST /api/v1/notifications/read":
        return await notificationsRead.handler(event);
      case "GET /api/v1/notifications/unread-count":
        return await notificationsUnreadCount.handler(event);

      // ── Bookmarks ──────────────────────────────────────────────────────
      case "PUT /api/v1/scenes/{sceneId}/bookmark":
        return await bookmarkSet.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}/bookmark":
        return await bookmarkDelete.handler(event);
      case "GET /api/v1/bookmarks":
        return await bookmarksList.handler(event);

      // ── Shots (viewpoints) ───────────────────────────────────────────
      case "POST /api/v1/scenes/{sceneId}/shots":
        return await shotCreate.handler(event);
      case "GET /api/v1/scenes/{sceneId}/shots":
        return await shotsList.handler(event);
      case "GET /api/v1/scenes/{sceneId}/shots/{shotId}":
        return await shotGet.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}/shots/{shotId}":
        return await shotDelete.handler(event);

      // ── Tours (guided fly-through) ────────────────────────────────────
      case "POST /api/v1/scenes/{sceneId}/tours":
        return await tourCreate.handler(event);
      case "GET /api/v1/scenes/{sceneId}/tours":
        return await toursList.handler(event);
      case "GET /api/v1/scenes/{sceneId}/tours/{tourId}":
        return await tourGet.handler(event);
      case "DELETE /api/v1/scenes/{sceneId}/tours/{tourId}":
        return await tourDelete.handler(event);

      // ── Admin (admin-group gated inside the handler) ─────────────────────
      case "GET /admin/attempts":
        return await adminAttemptsList.handler(event);
      case "GET /admin/attempts/{attemptId}/logs":
        return await adminAttemptsLogs.handler(event);
      case "GET /admin/asg-config":
        return await adminAsgConfigGet.handler(event);
      case "POST /admin/asg-config":
        return await adminAsgConfigUpdate.handler(event);
      case "POST /admin/asg/boot":
        return await adminAsgBoot.handler(event);
      case "POST /admin/asg/release":
        return await adminAsgRelease.handler(event);
      case "GET /admin/asg/spot-price":
        return await adminAsgSpotPrice.handler(event);
      case "GET /admin/worker-amis":
        return await adminWorkerAmisList.handler(event);
      case "POST /admin/worker-amis":
        return await adminWorkerAmiRegister.handler(event);
      case "POST /admin/worker-amis/{amiId}/boot":
        return await adminWorkerAmiBoot.handler(event);
      case "POST /admin/worker-amis/{amiId}/activate":
        return await adminWorkerAmiActivate.handler(event);

      // ── Admin: user management (RBAC-gated inside each handler) ──────────
      case "GET /admin/users":
        return await adminUsersList.handler(event);
      case "GET /admin/users/{userId}":
        return await adminUsersGet.handler(event);
      case "POST /admin/users/{userId}/status":
        return await adminUsersStatus.handler(event);
      case "POST /admin/users/{userId}/verify-override":
        return await adminUsersVerifyOverride.handler(event);
      case "POST /admin/users/{userId}/reset-password":
        return await adminUsersResetPassword.handler(event);
      case "POST /admin/users/{userId}/revoke-sessions":
        return await adminUsersRevokeSessions.handler(event);
      case "POST /admin/users/{userId}/soft-delete":
        return await adminUsersSoftDelete.handler(event);
      case "POST /admin/users/{userId}/hard-delete":
        return await adminUsersHardDelete.handler(event);
      case "POST /admin/users/{userId}/roles":
        return await adminUsersRoles.handler(event);
      case "POST /admin/users/{userId}/plan":
        return await adminUsersPlan.handler(event);
      case "GET /admin/audit-logs":
        return await adminAuditLogsList.handler(event);

      // ── Internal (EventBridge-invoked only — not an API Gateway route) ────
      case "INTERNAL /asg/check-manual-mode":
        await adminAsgCheckManualMode.handler(event);
        return response(200, { ok: true });
      case "INTERNAL /retention/sweep":
        await retentionSweep.handler(event);
        return response(200, { ok: true });
      case "INTERNAL /attempts/reap":
        await attemptsReap.handler(event);
        return response(200, { ok: true });

      default:
        return response(404, { error: "Not found" });
    }
  } catch (err) {
    console.error("unhandled error", { route: event.routeKey, err });
    return response(500, { error: "Internal server error" });
  }
};
