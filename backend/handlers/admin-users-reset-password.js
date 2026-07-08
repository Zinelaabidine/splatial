"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission } = require("../lib/rbac");
const { adminResetUserPassword } = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");
const { notifyAdmins } = require("../lib/notify");

const dynamo = new DynamoDBClient({});

/**
 * POST /admin/users/{userId}/reset-password
 *
 * Forces the target user to set a new password at next sign-in
 * (AdminResetUserPassword puts the account in FORCE_CHANGE_PASSWORD /
 * RESET_REQUIRED state). Does not reveal or set a password directly.
 *
 * Body: { reason: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.reset_password");
  if (denied) return denied;

  const actorId = getClaims(event)?.sub;
  const targetUserId = event.pathParameters?.userId;
  if (!targetUserId) return response(400, { error: "Missing path parameter: userId" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  try {
    await adminResetUserPassword(targetUserId);
  } catch (err) {
    if (err.name === "UserNotFoundException") return response(404, { error: "User not found" });
    throw err;
  }

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.reset_password",
    reason: reason.slice(0, 500),
    correlationId: event.requestContext?.requestId,
  });

  await notifyAdmins({
    title: "User password reset triggered",
    message: `${actorId} triggered a password reset for ${targetUserId} — ${reason}`,
  });

  return response(200, { userId: targetUserId, status: "RESET_REQUIRED" });
};
