"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission } = require("../lib/rbac");
const { adminGetUser, adminSetVerification } = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");

const dynamo = new DynamoDBClient({});

/**
 * POST /admin/users/{userId}/verify-override
 *
 * Manual verification override for email and/or phone. Writes directly to
 * Cognito (email_verified / phone_number_verified) so it is authoritative —
 * no separate app-side "verified" flag to drift out of sync.
 *
 * Body: { emailVerified?: boolean, phoneVerified?: boolean, reason: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.verify_override");
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

  const { emailVerified, phoneVerified, reason } = body;
  if (emailVerified === undefined && phoneVerified === undefined) {
    return response(400, { error: "Provide at least one of emailVerified, phoneVerified" });
  }
  if (emailVerified !== undefined && typeof emailVerified !== "boolean") {
    return response(400, { error: "emailVerified must be a boolean" });
  }
  if (phoneVerified !== undefined && typeof phoneVerified !== "boolean") {
    return response(400, { error: "phoneVerified must be a boolean" });
  }
  if (typeof reason !== "string" || reason.trim() === "") {
    return response(400, { error: "A reason is required for this action." });
  }

  let before;
  try {
    before = await adminGetUser(targetUserId);
  } catch (err) {
    if (err.name === "UserNotFoundException") {
      return response(404, { error: "User not found" });
    }
    throw err;
  }

  await adminSetVerification(targetUserId, { emailVerified, phoneVerified });

  const after = {
    emailVerified: emailVerified !== undefined ? emailVerified : before.emailVerified,
    phoneVerified: phoneVerified !== undefined ? phoneVerified : before.phoneVerified,
  };

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.verify_override",
    beforeState: { emailVerified: before.emailVerified, phoneVerified: before.phoneVerified },
    afterState: after,
    reason: reason.trim().slice(0, 500),
    correlationId: event.requestContext?.requestId,
  });

  return response(200, { userId: targetUserId, ...after });
};
