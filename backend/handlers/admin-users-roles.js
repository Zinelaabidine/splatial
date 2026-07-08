"use strict";

const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission, ADMIN_GROUP, ASSIGNABLE_ROLES } = require("../lib/rbac");
const {
  adminListGroupsForUser,
  adminAddUserToGroup,
  adminRemoveUserFromGroup,
  listUserIdsInGroup,
} = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");
const { notifyAdmins } = require("../lib/notify");

const dynamo = new DynamoDBClient({});
const USERS_TABLE = process.env.USERS_TABLE_NAME;

/**
 * POST /admin/users/{userId}/roles
 *
 * Replaces the target user's role set (beyond the implicit "user" role
 * everyone has). Cognito group membership is the enforced source of truth
 * (see lib/rbac.js's design note); the `roles` attribute on the users table
 * is refreshed afterwards purely as a denormalized cache for fast list-view
 * rendering.
 *
 * Guardrails against privilege escalation / self-lockout:
 *   - An admin can never change their OWN roles through this endpoint.
 *   - The last remaining `admin`-group member can never be demoted.
 *
 * Body: { roles: string[] (subset of user/admin/moderator/beta_tester,
 *         "user" is implicit and never included), reason: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.assign_roles");
  if (denied) return denied;

  const actorId = getClaims(event)?.sub;
  const targetUserId = event.pathParameters?.userId;
  if (!targetUserId) return response(400, { error: "Missing path parameter: userId" });
  if (targetUserId === actorId) {
    return response(400, { error: "You cannot change your own roles." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }

  const { roles, reason } = body;
  if (!Array.isArray(roles)) {
    return response(400, { error: "roles must be an array" });
  }
  const desired = [...new Set(roles.map((r) => String(r).trim()))];
  const invalid = desired.filter((r) => !ASSIGNABLE_ROLES.includes(r));
  if (invalid.length > 0) {
    return response(400, {
      error: `Unknown role(s): ${invalid.join(", ")}. Must be one of: ${ASSIGNABLE_ROLES.join(", ")}`,
    });
  }
  if (typeof reason !== "string" || reason.trim() === "") {
    return response(400, { error: "A reason is required for this action." });
  }

  const currentGroups = await adminListGroupsForUser(targetUserId);
  const currentAssignable = currentGroups.filter((g) => ASSIGNABLE_ROLES.includes(g));

  const toAdd = desired.filter((r) => !currentAssignable.includes(r));
  const toRemove = currentAssignable.filter((r) => !desired.includes(r));

  // Guard the last admin: refuse if this change would remove ADMIN_GROUP
  // membership from the only remaining admin.
  if (toRemove.includes(ADMIN_GROUP)) {
    const admins = await listUserIdsInGroup(ADMIN_GROUP);
    if (admins.length <= 1 && admins.includes(targetUserId)) {
      return response(409, { error: "Cannot remove the last remaining admin's admin role." });
    }
  }

  for (const group of toAdd) await adminAddUserToGroup(targetUserId, group);
  for (const group of toRemove) await adminRemoveUserFromGroup(targetUserId, group);

  // Refresh the denormalized cache. DynamoDB rejects an empty String Set, so
  // an all-"user" outcome removes the attribute entirely (absence == ["user"]
  // everywhere it's read — see admin-users-list.js / admin-users-get.js).
  if (desired.length > 0) {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE,
        Key: { user_id: { S: targetUserId } },
        UpdateExpression: "SET roles = :roles",
        ExpressionAttributeValues: { ":roles": { SS: desired } },
      })
    );
  } else {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE,
        Key: { user_id: { S: targetUserId } },
        UpdateExpression: "REMOVE roles",
      })
    );
  }

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.assign_roles",
    beforeState: { roles: currentAssignable.length > 0 ? currentAssignable : ["user"] },
    afterState: { roles: desired.length > 0 ? desired : ["user"] },
    reason: reason.trim().slice(0, 500),
    correlationId: event.requestContext?.requestId,
  });

  if (toAdd.includes(ADMIN_GROUP) || toRemove.includes(ADMIN_GROUP)) {
    await notifyAdmins({
      title: "Admin role changed",
      message: `${actorId} changed admin-group membership for ${targetUserId}: +[${toAdd}] -[${toRemove}] — ${reason}`,
    });
  }

  return response(200, { userId: targetUserId, roles: desired.length > 0 ? desired : ["user"] });
};
