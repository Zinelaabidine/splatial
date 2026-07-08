"use strict";

const { DynamoDBClient, GetItemCommand, QueryCommand, BatchGetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { requirePermission } = require("../lib/rbac");
const { DEFAULT_STATUS } = require("../lib/account-status");
const { TIER_LIMITS, DEFAULT_TIER } = require("../lib/user-tier");
const { getRollingWindowCount, WINDOW_DAYS } = require("../lib/quota");
const { getStorageCapBytes, getStorageUsedBytes } = require("../lib/storage-quota");
const { profileResponseFromItem } = require("../lib/profile");
const { adminGetUser, adminListGroupsForUser } = require("../lib/cognito-admin");
const { listAuditLogsForUser } = require("../lib/audit-log");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

const RECENT_JOBS_LIMIT = 10;

/** A user's most recent scenes/attempts (any status), newest-updated first. */
async function recentJobActivity(userId) {
  // KEYS_ONLY GSI keyed on (user_id, status) — Query needs only the hash key,
  // so this returns every record for the user regardless of status.
  const keys = await dynamo.send(
    new QueryCommand({
      TableName: SCENES_TABLE,
      IndexName: "user_id-status-index",
      KeyConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": { S: userId } },
      Limit: 100, // safety cap; sorted/trimmed below
    })
  );

  const sceneIds = (keys.Items ?? []).map((i) => i.scene_id?.S).filter(Boolean);
  if (sceneIds.length === 0) return [];

  const items = [];
  for (let i = 0; i < sceneIds.length; i += 100) {
    const batch = await dynamo.send(
      new BatchGetItemCommand({
        RequestItems: {
          [SCENES_TABLE]: { Keys: sceneIds.slice(i, i + 100).map((id) => ({ scene_id: { S: id } })) },
        },
      })
    );
    for (const row of batch.Responses?.[SCENES_TABLE] ?? []) items.push(row);
  }

  return items
    .map((it) => ({
      sceneId: it.scene_id?.S ?? "",
      recordType: it.record_type?.S ?? "scene",
      name: it.name?.S ?? null,
      status: it.status?.S ?? "",
      createdAt: it.created_at?.S ?? null,
      updatedAt: it.updated_at?.S ?? null,
    }))
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .slice(0, RECENT_JOBS_LIMIT);
}

/**
 * GET /admin/users/{userId}
 *
 * Full detail view: profile info, account status/restrictions, join date,
 * best-available "last active" signal, verification state, plan tier,
 * roles, usage/quota summary, and a compact recent-job-activity slice.
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.read");
  if (denied) return denied;

  const userId = event.pathParameters?.userId;
  if (!userId) return response(400, { error: "Missing path parameter: userId" });

  const [profileRes, usersRowRes] = await Promise.all([
    dynamo.send(new GetItemCommand({ TableName: PROFILES_TABLE, Key: { user_id: { S: userId } } })),
    dynamo.send(new GetItemCommand({ TableName: USERS_TABLE, Key: { user_id: { S: userId } } })),
  ]);

  if (!profileRes.Item) {
    return response(404, { error: "User not found" });
  }

  const profile = await profileResponseFromItem(profileRes.Item, true);
  const usersRow = usersRowRes.Item;

  const status = usersRow?.status?.S ?? DEFAULT_STATUS;
  const statusReason = usersRow?.status_reason?.S ?? null;
  const statusChangedAt = usersRow?.status_changed_at?.S ?? null;
  const statusChangedBy = usersRow?.status_changed_by?.S ?? null;
  const tier = usersRow?.tier?.S ?? DEFAULT_TIER;

  // Cognito is authoritative for a single-user detail view (cheap at this
  // scale — one call, not N per list page). Falls back to the cached roles
  // on the users row if Cognito is unreachable, rather than failing the
  // whole page.
  let cognito = null;
  let roles = usersRow?.roles?.SS ?? ["user"];
  try {
    const [cognitoUser, groups] = await Promise.all([
      adminGetUser(userId),
      adminListGroupsForUser(userId),
    ]);
    cognito = cognitoUser;
    roles = groups.length > 0 ? groups : ["user"];
  } catch (err) {
    console.error("admin-users-get: cognito lookup failed", { userId, err: err.name });
  }

  const quotaLimit = TIER_LIMITS[tier];
  const usedInWindow = quotaLimit === null ? null : await getRollingWindowCount(dynamo, userId, WINDOW_DAYS);
  const storageCapBytes = getStorageCapBytes(tier);
  const storageUsedBytes = await getStorageUsedBytes(dynamo, userId);

  const [recentJobs, auditLogs] = await Promise.all([
    recentJobActivity(userId),
    listAuditLogsForUser(dynamo, userId, { limit: 10 }).catch(() => ({ items: [] })),
  ]);

  return response(200, {
    profile: { userId, ...profile },
    account: {
      status,
      statusReason,
      statusChangedAt,
      statusChangedBy,
      deletedAt: usersRow?.deleted_at?.S ?? null,
      deletedBy: usersRow?.deleted_by?.S ?? null,
      hardDeleted: usersRow?.hard_deleted?.BOOL ?? false,
    },
    cognito: cognito
      ? {
          enabled: cognito.enabled,
          userStatus: cognito.userStatus,
          userCreateDate: cognito.userCreateDate,
          lastModifiedDate: cognito.userLastModifiedDate,
          emailVerified: cognito.emailVerified,
          phoneVerified: cognito.phoneVerified,
        }
      : null,
    tier,
    roles,
    usage: {
      tier,
      quotaLimit,
      usedInWindow,
      windowDays: WINDOW_DAYS,
      storageCapBytes,
      storageUsedBytes,
    },
    recentJobs,
    recentAuditLogs: auditLogs.items,
  });
};
