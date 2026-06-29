"use strict";

const response = require("../lib/response");
const { markAllRead } = require("../lib/notifications");

/**
 * POST /api/v1/notifications/read
 *
 * Mark all notifications as read for the caller.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  await markAllRead(userId);
  return response(200, { unreadCount: 0 });
};
