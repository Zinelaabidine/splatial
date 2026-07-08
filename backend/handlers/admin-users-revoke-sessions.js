"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission } = require("../lib/rbac");
const { adminUserGlobalSignOut } = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");

const dynamo = new DynamoDBClient({});

/**
 * POST /admin/users/{userId}/revoke-sessions
 *
 * Force logout: invalidates the user's refresh tokens (AdminUserGlobalSignOut).
 * Already-issued access/ID tokens remain valid until their own short expiry —
 * Cognito has no server-side JWT revocation (same caveat as the ban flow).
 *
 * Body: { reason: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.revoke_sessions");
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
  if (!reason) return response(400, { error: "A reason is required for this action." });

  try {
    await adminUserGlobalSignOut(targetUserId);
  } catch (err) {
    if (err.name === "UserNotFoundException") return response(404, { error: "User not found" });
    throw err;
  }

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.revoke_sessions",
    reason: reason.slice(0, 500),
    correlationId: event.requestContext?.requestId,
  });

  return response(200, { userId: targetUserId, sessionsRevoked: true });
};
