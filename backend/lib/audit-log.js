"use strict";

const { PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");

/**
 * Structured audit trail for every sensitive admin user-management action
 * (suspend, ban, reactivate, verify override, reset password, revoke
 * sessions, soft/hard delete, role change, plan change).
 *
 * Table layout (see infra/modules/static-site/admin-users.tf):
 *   hash key  target_user_id
 *   range key log_sk = "<ISO-8601 created_at>#<log_id>"   (sorts newest-last;
 *                                                           reverse to read newest-first)
 *   GSI actor_admin_id-log_sk-index   -> "what has this admin done"
 *   GSI feed_bucket-log_sk-index      -> "every audit event, any user"
 *       (feed_bucket is a constant "ALL" fan-out key — see the sparse
 *       partition-key pattern already used for scenes' visibility-created_at
 *       index; audit-event volume is low enough that a single partition is
 *       fine, unlike the scenes table.)
 *
 * before_state / after_state are stored as JSON strings so arbitrary partial
 * snapshots can be recorded without a rigid schema (mirrors train_config /
 * colmap_config in submit-job.js).
 */

const TABLE_ENV = "AUDIT_LOGS_TABLE_NAME";

function safeJson(value) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * @param {import("@aws-sdk/client-dynamodb").DynamoDBClient} dynamo
 * @param {{
 *   actorAdminId: string,
 *   targetUserId: string,
 *   actionType: string,
 *   beforeState?: unknown,
 *   afterState?: unknown,
 *   reason?: string,
 *   correlationId?: string,
 * }} entry
 */
async function writeAuditLog(dynamo, entry) {
  const {
    actorAdminId,
    targetUserId,
    actionType,
    beforeState,
    afterState,
    reason,
    correlationId,
  } = entry;

  if (!actorAdminId || !targetUserId || !actionType) {
    throw new Error("writeAuditLog requires actorAdminId, targetUserId, and actionType");
  }

  const table = process.env[TABLE_ENV];
  const now = new Date().toISOString();
  const logId = randomUUID();
  const logSk = `${now}#${logId}`;

  const item = {
    target_user_id: { S: targetUserId },
    log_sk: { S: logSk },
    log_id: { S: logId },
    actor_admin_id: { S: actorAdminId },
    action_type: { S: actionType },
    created_at: { S: now },
    feed_bucket: { S: "ALL" },
  };
  if (reason) item.reason = { S: String(reason).slice(0, 500) };
  if (correlationId) item.correlation_id = { S: String(correlationId) };
  const before = safeJson(beforeState);
  const after = safeJson(afterState);
  if (before !== null) item.before_state = { S: before };
  if (after !== null) item.after_state = { S: after };

  await dynamo.send(new PutItemCommand({ TableName: table, Item: item }));

  return { logId, createdAt: now };
}

function mapAuditLogItem(item) {
  return {
    logId: item.log_id?.S ?? "",
    targetUserId: item.target_user_id?.S ?? "",
    actorAdminId: item.actor_admin_id?.S ?? "",
    actionType: item.action_type?.S ?? "",
    reason: item.reason?.S ?? null,
    correlationId: item.correlation_id?.S ?? null,
    beforeState: item.before_state?.S ? JSON.parse(item.before_state.S) : null,
    afterState: item.after_state?.S ? JSON.parse(item.after_state.S) : null,
    createdAt: item.created_at?.S ?? null,
  };
}

/** Audit logs for a single target user, newest first. */
async function listAuditLogsForUser(dynamo, targetUserId, { limit = 50, cursor } = {}) {
  const table = process.env[TABLE_ENV];
  const out = await dynamo.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "target_user_id = :uid",
      ExpressionAttributeValues: { ":uid": { S: targetUserId } },
      ScanIndexForward: false, // newest log_sk first
      Limit: limit,
      ExclusiveStartKey: cursor,
    })
  );
  return {
    items: (out.Items ?? []).map(mapAuditLogItem),
    lastEvaluatedKey: out.LastEvaluatedKey,
  };
}

/** Global audit feed across every user, newest first. */
async function listAllAuditLogs(dynamo, { limit = 50, cursor } = {}) {
  const table = process.env[TABLE_ENV];
  const out = await dynamo.send(
    new QueryCommand({
      TableName: table,
      IndexName: "feed_bucket-log_sk-index",
      KeyConditionExpression: "feed_bucket = :b",
      ExpressionAttributeValues: { ":b": { S: "ALL" } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: cursor,
    })
  );
  return {
    items: (out.Items ?? []).map(mapAuditLogItem),
    lastEvaluatedKey: out.LastEvaluatedKey,
  };
}

/** Every action taken BY a given admin, newest first. */
async function listAuditLogsByActor(dynamo, actorAdminId, { limit = 50, cursor } = {}) {
  const table = process.env[TABLE_ENV];
  const out = await dynamo.send(
    new QueryCommand({
      TableName: table,
      IndexName: "actor_admin_id-log_sk-index",
      KeyConditionExpression: "actor_admin_id = :a",
      ExpressionAttributeValues: { ":a": { S: actorAdminId } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: cursor,
    })
  );
  return {
    items: (out.Items ?? []).map(mapAuditLogItem),
    lastEvaluatedKey: out.LastEvaluatedKey,
  };
}

module.exports = {
  writeAuditLog,
  mapAuditLogItem,
  listAuditLogsForUser,
  listAllAuditLogs,
  listAuditLogsByActor,
};
