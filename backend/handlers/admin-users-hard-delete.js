"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission, ADMIN_GROUP, callerGroups } = require("../lib/rbac");
const { adminDeleteUser, adminListGroupsForUser, listUserIdsInGroup } = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");
const { notifyAdmins } = require("../lib/notify");

const dynamo = new DynamoDBClient({});
const USERS_TABLE = process.env.USERS_TABLE_NAME;
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const USERNAMES_TABLE = process.env.USERNAMES_TABLE_NAME;

const REDACTED_NAME = "Deleted User";

/**
 * POST /admin/users/{userId}/hard-delete
 *
 * Highly-restricted, irreversible, audit-logged. Requires the `admin`
 * Cognito group specifically (not just the users.hard_delete permission in
 * the abstract — moderators never hold this permission at all, and this is
 * a second, explicit gate) plus typed confirmation (`confirmUserId` must
 * exactly match the path's userId) and a reason.
 *
 * GDPR-aware tradeoff (documented, not silently applied): scenes, comments,
 * reactions, follows, job/audit history, etc. are NOT deleted — user_id
 * remains a valid foreign key throughout those tables, which is what keeps
 * billing history, abuse investigations, and other users' content (e.g. a
 * comment thread this user participated in) intact. Instead:
 *   - The Cognito identity is permanently deleted (AdminDeleteUser) — this
 *     IS irreversible: no sign-in will ever be possible again for this sub.
 *   - The profile row is anonymized in place (name/bio/avatar/email wiped,
 *     username released back to the pool).
 *   - The users-table row is flagged status=HARD_DELETED, hard_deleted=true.
 * This is the "GDPR-friendly anonymization plus irreversible access
 * revocation" option called out as acceptable when full physical deletion
 * would break referential/audit/billing integrity.
 *
 * Body: { reason: string, confirmUserId: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.hard_delete");
  if (denied) return denied;

  if (!callerGroups(event).includes(ADMIN_GROUP)) {
    return response(403, { error: "Hard delete requires the admin group." });
  }

  const actorId = getClaims(event)?.sub;
  const targetUserId = event.pathParameters?.userId;
  if (!targetUserId) return response(400, { error: "Missing path parameter: userId" });
  if (targetUserId === actorId) {
    return response(400, { error: "You cannot hard-delete your own account." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const confirmUserId = typeof body.confirmUserId === "string" ? body.confirmUserId.trim() : "";
  if (!reason) return response(400, { error: "A reason is required for this action." });
  if (confirmUserId !== targetUserId) {
    return response(400, {
      error: "confirmUserId must exactly match the userId being deleted.",
    });
  }

  // Self-lockout / system-integrity guardrail: never allow the last admin to
  // be permanently removed via this flow.
  let targetGroups = [];
  try {
    targetGroups = await adminListGroupsForUser(targetUserId);
  } catch (err) {
    if (err.name !== "UserNotFoundException") throw err;
  }
  if (targetGroups.includes(ADMIN_GROUP)) {
    const admins = await listUserIdsInGroup(ADMIN_GROUP);
    if (admins.length <= 1) {
      return response(409, { error: "Cannot hard-delete the last remaining admin account." });
    }
  }

  const { Item: usersRow } = await dynamo.send(
    new GetItemCommand({ TableName: USERS_TABLE, Key: { user_id: { S: targetUserId } } })
  );
  if (usersRow?.hard_deleted?.BOOL) {
    return response(409, { error: "User is already hard-deleted." });
  }

  const { Item: profileRow } = await dynamo.send(
    new GetItemCommand({ TableName: PROFILES_TABLE, Key: { user_id: { S: targetUserId } } })
  );
  if (!profileRow) return response(404, { error: "User not found" });

  const before = {
    displayName: profileRow.display_name?.S ?? null,
    username: profileRow.username?.S ?? null,
    email: profileRow.email?.S ?? null,
    status: usersRow?.status?.S ?? "ACTIVE",
  };

  const now = new Date().toISOString();

  // 1. Permanently remove the Cognito identity — irreversible.
  try {
    await adminDeleteUser(targetUserId);
  } catch (err) {
    if (err.name !== "UserNotFoundException") throw err;
  }

  // 2. Release the username so it can be reused, then anonymize the profile.
  if (before.username && USERNAMES_TABLE) {
    await dynamo
      .send(new DeleteItemCommand({ TableName: USERNAMES_TABLE, Key: { username: { S: before.username } } }))
      .catch((err) => console.error("admin-users-hard-delete: username release failed", { err: err.name }));
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: targetUserId } },
      UpdateExpression:
        "SET display_name = :name, bio = :empty, updated_at = :now REMOVE email, username, avatar_key, avatar_bucket",
      ExpressionAttributeValues: {
        ":name": { S: REDACTED_NAME },
        ":empty": { S: "" },
        ":now": { S: now },
      },
    })
  );

  // 3. Flag the users-table row as terminally deleted.
  await dynamo.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { user_id: { S: targetUserId } },
      UpdateExpression:
        "SET #s = :status, status_reason = :reason, status_changed_at = :now, status_changed_by = :actor, " +
        "deleted_at = :now, deleted_by = :actor, hard_deleted = :true",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": { S: "HARD_DELETED" },
        ":reason": { S: reason },
        ":now": { S: now },
        ":actor": { S: actorId },
        ":true": { BOOL: true },
      },
    })
  );

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.hard_delete",
    beforeState: before,
    afterState: { status: "HARD_DELETED", displayName: REDACTED_NAME },
    reason,
    correlationId: event.requestContext?.requestId,
  });

  await notifyAdmins({
    title: "User hard-deleted",
    message: `${actorId} hard-deleted user ${targetUserId} — ${reason}`,
  });

  return response(200, { userId: targetUserId, status: "HARD_DELETED" });
};
