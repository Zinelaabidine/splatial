"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const logger = require("../lib/logger");
const { getClaims, requirePermission, ADMIN_GROUP, callerGroups } = require("../lib/rbac");
const { ACCOUNT_STATUSES, DEFAULT_STATUS } = require("../lib/account-status");
const { adminDisableUser, adminEnableUser, adminUserGlobalSignOut, adminListGroupsForUser } = require("../lib/cognito-admin");
const { writeAuditLog } = require("../lib/audit-log");
const { notifyAdmins } = require("../lib/notify");

const dynamo = new DynamoDBClient({});
const USERS_TABLE = process.env.USERS_TABLE_NAME;
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

// action -> { permission, fromStatuses, toStatus, reasonRequired }
const ACTIONS = {
  suspend: { permission: "users.suspend", from: new Set(["ACTIVE"]), to: "SUSPENDED", reasonRequired: true },
  ban: { permission: "users.ban", from: new Set(["ACTIVE", "SUSPENDED"]), to: "BANNED", reasonRequired: true },
  reactivate: {
    permission: "users.reactivate",
    from: new Set(["SUSPENDED", "BANNED", "SOFT_DELETED"]),
    to: "ACTIVE",
    reasonRequired: false,
  },
};

/**
 * Cancels every QUEUED (not PROCESSING) job belonging to `userId`. Mirrors
 * the exact status-transition safety already established in cancel-job.js —
 * the worker checks DynamoDB status before starting, so flipping QUEUED ->
 * CANCELLED here is safe and leaves nothing orphaned. PROCESSING attempts
 * are deliberately left running (see CLAUDE.md §8 — "existing running jobs
 * may continue"); killing a mid-flight EC2 Spot worker cleanly from here
 * would need a second signal path (SQS/SIGTERM) this endpoint does not own.
 */
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
 * POST /admin/users/{userId}/status
 *
 * Body: { action: "suspend" | "ban" | "reactivate", reason?: string }
 *
 * Suspend/ban block all NEW job submissions and uploads immediately
 * (enforced server-side in submit-job.js / init.js / upload-from-gdrive.js
 * on every call, not just at the moment of this action) and cancel any
 * currently-QUEUED jobs. Ban additionally disables Cognito sign-in and
 * revokes active sessions. Reactivate restores access only — it does not
 * restore any data or jobs that were cancelled/deleted in the meantime.
 */
exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const config = ACTIONS[action];
  if (!config) {
    return response(400, { error: `action must be one of: ${Object.keys(ACTIONS).join(", ")}` });
  }

  const denied = requirePermission(event, config.permission);
  if (denied) return denied;

  const claims = getClaims(event);
  const actorId = claims?.sub;
  const targetUserId = event.pathParameters?.userId;
  if (!targetUserId) return response(400, { error: "Missing path parameter: userId" });

  if (targetUserId === actorId) {
    return response(400, { error: "You cannot change your own account status." });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (config.reasonRequired && !reason) {
    return response(400, { error: "A reason is required for this action." });
  }

  // Protect higher-privileged accounts from lower-privileged admins: a
  // moderator (who holds users.suspend/users.ban but not the admin group)
  // cannot act on a target who is themselves an admin.
  if (!callerGroups(event).includes(ADMIN_GROUP)) {
    try {
      const targetGroups = await adminListGroupsForUser(targetUserId);
      if (targetGroups.includes(ADMIN_GROUP)) {
        return response(403, { error: "Only an admin can change the status of another admin's account." });
      }
    } catch (err) {
      console.error("admin-users-status: group lookup failed", { targetUserId, err: err.name });
    }
  }

  const { Item: usersRow } = await dynamo.send(
    new GetItemCommand({ TableName: USERS_TABLE, Key: { user_id: { S: targetUserId } } })
  );
  const currentStatus = usersRow?.status?.S && ACCOUNT_STATUSES.includes(usersRow.status.S)
    ? usersRow.status.S
    : DEFAULT_STATUS;

  if (!config.from.has(currentStatus)) {
    return response(409, {
      error: `Cannot ${action} a user currently in status ${currentStatus}`,
      currentStatus,
    });
  }

  const now = new Date().toISOString();
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE,
        Key: { user_id: { S: targetUserId } },
        UpdateExpression:
          "SET #s = :newStatus, status_reason = :reason, status_changed_at = :now, status_changed_by = :actor",
        ConditionExpression:
          "attribute_not_exists(#s) OR #s = :expected",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":newStatus": { S: config.to },
          ":reason": { S: reason },
          ":now": { S: now },
          ":actor": { S: actorId },
          ":expected": { S: currentStatus },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "User status changed concurrently; refresh and try again." });
    }
    throw err;
  }

  let cancelledJobs = 0;
  if (action === "suspend" || action === "ban") {
    cancelledJobs = await cancelQueuedJobsForUser(targetUserId);
  }

  if (action === "ban") {
    await adminDisableUser(targetUserId).catch((err) =>
      console.error("admin-users-status: adminDisableUser failed", { targetUserId, err: err.name })
    );
    await adminUserGlobalSignOut(targetUserId).catch((err) =>
      console.error("admin-users-status: adminUserGlobalSignOut failed", { targetUserId, err: err.name })
    );
  } else if (action === "reactivate") {
    await adminEnableUser(targetUserId).catch((err) =>
      console.error("admin-users-status: adminEnableUser failed", { targetUserId, err: err.name })
    );
  }

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: `user.${action}`,
    beforeState: { status: currentStatus },
    afterState: { status: config.to, cancelledQueuedJobs: cancelledJobs },
    reason,
    correlationId: event.requestContext?.requestId,
  });

  logger.forEvent(event, "admin-users-status").event(`admin.user.${action}`, {
    data: { actorId, targetUserId, from: currentStatus, to: config.to, cancelledJobs },
  });

  await notifyAdmins({
    title: `User ${action}ed`,
    message: `${actorId} ${action}ed user ${targetUserId} (${currentStatus} -> ${config.to})${reason ? ` — ${reason}` : ""}`,
  });

  return response(200, { userId: targetUserId, status: config.to, cancelledQueuedJobs: cancelledJobs });
};
