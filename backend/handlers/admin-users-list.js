"use strict";

const { DynamoDBClient, ScanCommand, BatchGetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { requirePermission } = require("../lib/rbac");
const { DEFAULT_STATUS } = require("../lib/account-status");
const { DEFAULT_TIER } = require("../lib/user-tier");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SCAN_PAGE_SIZE = 100;
const MAX_SCAN_PAGES = 10;

const SORTABLE_FIELDS = new Set(["joinedAt", "email", "status", "tier", "displayName"]);

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
 * GET /admin/users
 *
 * Searchable / filterable / sortable / paginated user directory.
 *
 * The profiles table (one row per authenticated user — see
 * lib/profile.js / profile-get-me.js) is the source of truth for "every
 * user that exists." The users table (tier/status/roles cache) is sparse —
 * a row only exists once an admin action or tiered feature has touched that
 * user — so it is used for ENRICHMENT here via BatchGetItem, never as the
 * primary scan target (scanning it directly would silently omit every user
 * who has never been assigned a non-default tier/status).
 *
 * Query params:
 *   email        - substring match against email/username/displayName (case-insensitive)
 *   status       - exact match: ACTIVE | SUSPENDED | BANNED | SOFT_DELETED
 *   tier         - exact match: free | pro
 *   role         - exact match: user | admin | moderator | beta_tester
 *   joinedFrom   - ISO date, inclusive lower bound on profile created_at
 *   joinedTo     - ISO date, inclusive upper bound on profile created_at
 *   sort         - "<field>:asc|desc" (default "joinedAt:desc")
 *   limit        - 1..100, default 25
 *   cursor       - opaque pagination cursor from a previous response
 *
 * TODO: add a GSI (or a search index) for email/username at production
 * scale — this Scan-and-filter approach mirrors admin-attempts-list.js and
 * shares its limitation: text search degrades to a best-effort per-page
 * filter rather than a true full-table search.
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.read");
  if (denied) return denied;

  const qs = event.queryStringParameters ?? {};
  const emailFilter = (qs.email ?? "").trim().toLowerCase();
  const statusFilter = (qs.status ?? "").trim().toUpperCase();
  const tierFilter = (qs.tier ?? "").trim().toLowerCase();
  const roleFilter = (qs.role ?? "").trim().toLowerCase();
  const joinedFrom = (qs.joinedFrom ?? "").trim();
  const joinedTo = (qs.joinedTo ?? "").trim();
  const limit = Math.min(Math.max(parseInt(qs.limit ?? "", 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const [sortFieldRaw, sortDirRaw] = (qs.sort ?? "joinedAt:desc").split(":");
  const sortField = SORTABLE_FIELDS.has(sortFieldRaw) ? sortFieldRaw : "joinedAt";
  const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

  const exprNames = {};
  const exprValues = {};
  const filters = [];
  if (joinedFrom) {
    exprNames["#ca"] = "created_at";
    exprValues[":jf"] = { S: joinedFrom };
    filters.push("#ca >= :jf");
  }
  if (joinedTo) {
    exprNames["#ca"] = "created_at";
    exprValues[":jt"] = { S: joinedTo };
    filters.push("#ca <= :jt");
  }

  const rows = [];
  let exclusiveStartKey = decodeCursor(qs.cursor);
  let nextCursor;
  let pages = 0;

  while (pages < MAX_SCAN_PAGES) {
    pages += 1;
    const out = await dynamo.send(
      new ScanCommand({
        TableName: PROFILES_TABLE,
        FilterExpression: filters.length ? filters.join(" AND ") : undefined,
        ExpressionAttributeNames: Object.keys(exprNames).length ? exprNames : undefined,
        ExpressionAttributeValues: Object.keys(exprValues).length ? exprValues : undefined,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: SCAN_PAGE_SIZE,
      })
    );

    for (const it of out.Items ?? []) rows.push(it);

    exclusiveStartKey = out.LastEvaluatedKey;
    if (rows.length >= limit * 3 && exclusiveStartKey) {
      // Over-fetch a bit past `limit` so post-filters (email/status/tier/role,
      // which the profiles Scan itself cannot express) still usually yield a
      // full page before we hand back a cursor.
      nextCursor = encodeCursor(exclusiveStartKey);
      break;
    }
    if (!exclusiveStartKey) break;
  }

  // Enrich with the users table (tier/status/roles/storage) via BatchGetItem.
  const userIds = [...new Set(rows.map((r) => r.user_id?.S).filter(Boolean))];
  const enrichment = {};
  for (let i = 0; i < userIds.length; i += 100) {
    const batchIds = userIds.slice(i, i + 100);
    if (batchIds.length === 0) continue;
    const batch = await dynamo.send(
      new BatchGetItemCommand({
        RequestItems: {
          [USERS_TABLE]: { Keys: batchIds.map((id) => ({ user_id: { S: id } })) },
        },
      })
    );
    for (const row of batch.Responses?.[USERS_TABLE] ?? []) {
      enrichment[row.user_id?.S ?? ""] = row;
    }
  }

  let items = rows.map((p) => {
    const userId = p.user_id?.S ?? "";
    const u = enrichment[userId];
    const status = u?.status?.S ?? DEFAULT_STATUS;
    const tier = u?.tier?.S ?? DEFAULT_TIER;
    const roles = u?.roles?.SS ?? ["user"];
    return {
      userId,
      email: p.email?.S ?? null,
      username: p.username?.S ?? null,
      displayName: p.display_name?.S ?? "",
      status,
      tier,
      roles,
      joinedAt: p.created_at?.S ?? null,
      scenesCount: Number(p.scenes_count?.N ?? 0),
      followersCount: Number(p.followers_count?.N ?? 0),
    };
  });

  if (emailFilter) {
    items = items.filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(emailFilter) ||
        (u.username ?? "").toLowerCase().includes(emailFilter) ||
        (u.displayName ?? "").toLowerCase().includes(emailFilter)
    );
  }
  if (statusFilter) {
    items = items.filter((u) => u.status === statusFilter);
  } else {
    // Default view hides soft/hard-deleted accounts — still reachable via an
    // explicit ?status=SOFT_DELETED filter.
    items = items.filter((u) => u.status !== "SOFT_DELETED" && u.status !== "HARD_DELETED");
  }
  if (tierFilter) items = items.filter((u) => u.tier === tierFilter);
  if (roleFilter) items = items.filter((u) => u.roles.includes(roleFilter));

  items.sort((a, b) => {
    const av = String(a[sortField] ?? "");
    const bv = String(b[sortField] ?? "");
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  items = items.slice(0, limit);

  return response(200, { items, ...(nextCursor ? { cursor: nextCursor } : {}) });
};
