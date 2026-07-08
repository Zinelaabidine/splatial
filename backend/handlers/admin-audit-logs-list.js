"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { requirePermission } = require("../lib/rbac");
const { listAuditLogsForUser, listAllAuditLogs, listAuditLogsByActor } = require("../lib/audit-log");

const dynamo = new DynamoDBClient({});

function encodeCursor(key) {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64");
}

function decodeCursor(cursor) {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * GET /admin/audit-logs?targetUserId=...&actorAdminId=...&limit=&cursor=
 *
 * Global audit trail for every sensitive admin user-management action.
 * Exactly one of targetUserId / actorAdminId may be given to narrow the
 * feed; with neither, returns every audit event across all users (backed by
 * the feed_bucket-log_sk sparse GSI — see lib/audit-log.js).
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "audit_logs.read");
  if (denied) return denied;

  const qs = event.queryStringParameters ?? {};
  const targetUserId = (qs.targetUserId ?? "").trim();
  const actorAdminId = (qs.actorAdminId ?? "").trim();
  const limit = Math.min(Math.max(parseInt(qs.limit ?? "", 10) || 50, 1), 100);
  const cursor = decodeCursor(qs.cursor);

  let result;
  if (targetUserId) {
    result = await listAuditLogsForUser(dynamo, targetUserId, { limit, cursor });
  } else if (actorAdminId) {
    result = await listAuditLogsByActor(dynamo, actorAdminId, { limit, cursor });
  } else {
    result = await listAllAuditLogs(dynamo, { limit, cursor });
  }

  return response(200, {
    items: result.items,
    ...(result.lastEvaluatedKey ? { cursor: encodeCursor(result.lastEvaluatedKey) } : {}),
  });
};
