"use strict";

const {
  DynamoDBClient,
  ScanCommand,
  BatchGetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { isAdmin } = require("../lib/admin-auth");
const { mapProgressFromItem } = require("../lib/progress-fields");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SCAN_PAGE_SIZE = 100; // items scanned per DynamoDB page (pre-filter)
const MAX_SCAN_PAGES = 10; // safety cap on table scans per request

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
 * Map an attempt DynamoDB item to the admin-safe shape.
 * NEVER includes worker_token or any secret — see the logging spec, §8.
 */
function mapAttempt(item) {
  return {
    attemptId: item.scene_id?.S ?? "",
    parentSceneId: item.parent_scene_id?.S ?? null,
    userId: item.user_id?.S ?? null,
    attemptNumber: item.attempt_number?.N ? Number(item.attempt_number.N) : null,
    status: item.status?.S ?? "",
    ec2InstanceId: item.ec2_instance_id?.S ?? null,
    spotRequestId: item.spot_request_id?.S ?? null,
    failureReason: item.failure_reason?.S ?? null,
    errorMessage: item.error_message?.S ?? null,
    createdAt: item.created_at?.S ?? null,
    updatedAt: item.updated_at?.S ?? null,
    ...mapProgressFromItem(item),
  };
}

/**
 * GET /admin/attempts
 *
 * Admin-only. Lists training attempts (rows where record_type = "attempt") from
 * the scenes table for the operations overview. Reads DynamoDB only — no
 * CloudWatch. The per-job worker_token is never returned.
 *
 * Query: ?status=PROCESSING&limit=25&cursor=<opaque>
 *   - status : optional, exact match on the attempt status (case-insensitive in).
 *   - limit  : soft minimum batch size (1..100, default 25). A response may
 *              contain slightly more than `limit` (we never split a scan page),
 *              and a `cursor` is returned when more rows likely remain.
 *
 * Success (200): { items: AdminAttempt[], cursor?: "<opaque>" }
 *
 * TODO: add a GSI on record_type (e.g. record_type-updated_at-index) so this
 *       becomes a Query instead of a table Scan at production scale.
 */
exports.handler = async (event) => {
  if (!isAdmin(event)) {
    return response(403, { error: "Forbidden: admin role required" });
  }

  const qs = event.queryStringParameters ?? {};
  const statusFilter =
    typeof qs.status === "string" ? qs.status.trim().toUpperCase() : "";
  const limit = Math.min(
    Math.max(parseInt(qs.limit ?? "", 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const exprNames = { "#rt": "record_type" };
  const exprValues = { ":attempt": { S: "attempt" } };
  let filter = "#rt = :attempt";
  if (statusFilter) {
    exprNames["#st"] = "status";
    exprValues[":st"] = { S: statusFilter };
    filter += " AND #st = :st";
  }

  const items = [];
  let exclusiveStartKey = decodeCursor(qs.cursor);
  let nextCursor;
  let pages = 0;

  while (pages < MAX_SCAN_PAGES) {
    pages += 1;
    const out = await dynamo.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: filter,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: SCAN_PAGE_SIZE,
      }),
    );

    for (const it of out.Items ?? []) {
      items.push(mapAttempt(it));
    }

    exclusiveStartKey = out.LastEvaluatedKey;

    // Stop once we have enough matches; hand back a page-boundary cursor so the
    // client can load more without skipping rows.
    if (items.length >= limit && exclusiveStartKey) {
      nextCursor = encodeCursor(exclusiveStartKey);
      break;
    }
    if (!exclusiveStartKey) break; // scanned the whole table
  }

  // Newest first.
  items.sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );

  // Best-effort: enrich with parent scene names (non-fatal).
  try {
    const parentIds = [
      ...new Set(items.map((i) => i.parentSceneId).filter(Boolean)),
    ].slice(0, 100);

    if (parentIds.length > 0) {
      const batch = await dynamo.send(
        new BatchGetItemCommand({
          RequestItems: {
            [TABLE]: {
              Keys: parentIds.map((id) => ({ scene_id: { S: id } })),
              ProjectionExpression: "scene_id, #nm",
              ExpressionAttributeNames: { "#nm": "name" },
            },
          },
        }),
      );
      const names = {};
      for (const row of batch.Responses?.[TABLE] ?? []) {
        names[row.scene_id?.S ?? ""] = row.name?.S ?? null;
      }
      for (const i of items) {
        i.sceneName = i.parentSceneId ? (names[i.parentSceneId] ?? null) : null;
      }
    }
  } catch {
    /* name enrichment is best-effort; ignore failures */
  }

  return response(200, { items, ...(nextCursor ? { cursor: nextCursor } : {}) });
};
