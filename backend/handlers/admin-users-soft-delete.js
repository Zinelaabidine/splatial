"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission } = require("../lib/rbac");
const { DEFAULT_STATUS } = require("../lib/account-status");
const { adminDisableUser, adminUserGlobalSignOut } = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");
const { notifyAdmins } = require("../lib/notify");

const dynamo = new DynamoDBClient({});
const USERS_TABLE = process.env.USERS_TABLE_NAME;
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/** Same safe QUEUED->CANCELLED transition used by admin-users-status.js. */
async function cancelQueuedJobsForUser(userId) {
  const keys = await dynamo.send(
    new QueryCommand({
      TableName: SCENES_TABLE,
      IndexName: "user_id-status-index",
      KeyConditionExpression: "user_id = :uid AND #s = :queued",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":uid": { S: userId }, ":queued": { S: "QUEUED" } },
      Limit: 100,
    })
  );
  const now = new Date().toISOString();
  let cancelled = 0;
  for (const item of keys.Items ?? []) {
    const sceneId = item.scene_id?.S;
    if (!sceneId) continue;
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: SCENES_TABLE,
          Key: { scene_id: { S: sceneId } },
          UpdateExpression: "SET #s = :cancelled, updated_at = :now",
          ConditionExpression: "#s = :queued",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":cancelled": { S: "CANCELLED" },
            ":now": { S: now },
            ":queued": { S: "QUEUED" },
          },
        })
      );
      cancelled += 1;
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
    }
  }
  return cancelled;
}

/**
 * POST /admin/users/{userId}/soft-delete
 *
 * GDPR-aware default deletion path: disables login, revokes sessions,
 * cancels queued jobs, marks the account SOFT_DELETED, and hides it from
 * the default user-directory list (still visible with ?status=SOFT_DELETED).
 * Underlying rows (scenes, comments, follows, etc.) are preserved for
 * auditability/referential integrity — see admin-users-hard-delete.js for
 * the irreversible, admin-only anonymization path.
 *
 * Body: { reason: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.soft_delete");
  if (denied) return denied;

  const actorId = getClaims(event)?.sub;
  const targetUserId = event.pathParameters?.userId;
  if (!targetUserId) return response(400, { error: "Missing path parameter: userId" });
  if (targetUserId === actorId) {
    return response(400, { error: "You cannot delete your own account from the admin panel." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return response(400, { error: "A reason is required for this action." });

  const { Item: usersRow } = await dynamo.send(
    new GetItemCommand({ TableName: USERS_TABLE, Key: { user_id: { S: targetUserId } } })
  );
  const currentStatus = usersRow?.status?.S ?? DEFAULT_STATUS;
  if (currentStatus === "SOFT_DELETED" || currentStatus === "HARD_DELETED") {
    return response(409, { error: `User is already ${currentStatus}`, currentStatus });
  }

  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { user_id: { S: targetUserId } },
      UpdateExpression:
        "SET #s = :deleted, status_reason = :reason, status_changed_at = :now, status_changed_by = :actor, " +
        "deleted_at = :now, deleted_by = :actor",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":deleted": { S: "SOFT_DELETED" },
        ":reason": { S: reason },
        ":now": { S: now },
        ":actor": { S: actorId },
      },
    })
  );

  const cancelledJobs = await cancelQueuedJobsForUser(targetUserId);

  await adminDisableUser(targetUserId).catch((err) =>
    console.error("admin-users-soft-delete: adminDisableUser failed", { targetUserId, err: err.name })
  );
  await adminUserGlobalSignOut(targetUserId).catch((err) =>
    console.error("admin-users-soft-delete: adminUserGlobalSignOut failed", { targetUserId, err: err.name })
  );

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.soft_delete",
    beforeState: { status: currentStatus },
    afterState: { status: "SOFT_DELETED", cancelledQueuedJobs: cancelledJobs },
    reason,
    correlationId: event.requestContext?.requestId,
  });

  await notifyAdmins({
    title: "User soft-deleted",
    message: `${actorId} soft-deleted user ${targetUserId} — ${reason}`,
  });

  return response(200, { userId: targetUserId, status: "SOFT_DELETED", cancelledQueuedJobs: cancelledJobs });
};
