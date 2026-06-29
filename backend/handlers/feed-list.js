"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { listFollowing } = require("../lib/follows");
const { feedItemFromScene } = require("../lib/scene-response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const FANOUT_BATCH_SIZE = 25;

async function presignedThumbnailUrl(item) {
  const key = item.thumbnail_key?.S;
  if (!key) return undefined;
  const bucket = item.thumbnail_bucket?.S ?? SPLAT_BUCKET;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

async function presignedOwnerAvatarUrl(item) {
  const key = item.owner_avatar_key?.S;
  const bucket = item.owner_avatar_bucket?.S;
  if (!key || !bucket) return null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseCursor(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const cursor = raw.trim();
  if (Number.isNaN(Date.parse(cursor))) return null;
  return cursor;
}

/**
 * Query public scenes for one followee. Index projection is ALL, so owner_* and
 * thumbnail_* attributes are available directly — no extra GetItem needed.
 */
async function queryFolloweeScenes(followeeId, limit, cursor) {
  const values = { ":owner": { S: followeeId } };
  let keyCondition = "public_owner_id = :owner";
  if (cursor) {
    keyCondition += " AND created_at < :cursor";
    values[":cursor"] = { S: cursor };
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "public_owner-created_at-index",
      KeyConditionExpression: keyCondition,
      FilterExpression: "attribute_exists(#nm)",
      ExpressionAttributeNames: { "#nm": "name" },
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return result.Items ?? [];
}

async function fanOutFolloweeScenes(followeeIds, limit, cursor) {
  const allItems = [];

  for (let i = 0; i < followeeIds.length; i += FANOUT_BATCH_SIZE) {
    const batch = followeeIds.slice(i, i + FANOUT_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((followeeId) => queryFolloweeScenes(followeeId, limit, cursor))
    );
    for (const items of batchResults) {
      allItems.push(...items);
    }
  }

  return allItems;
}

function mergeAndPage(items, limit) {
  const seen = new Set();
  const merged = [];

  const sorted = [...items].sort((a, b) => {
    const aTime = a.created_at?.S ?? "";
    const bTime = b.created_at?.S ?? "";
    return bTime.localeCompare(aTime);
  });

  for (const item of sorted) {
    const sceneId = item.scene_id?.S;
    if (!sceneId || seen.has(sceneId)) continue;
    seen.add(sceneId);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}

/**
 * GET /api/v1/feed
 *
 * Returns a paginated feed of public scenes from users the caller follows.
 *
 * Query: ?cursor=<iso-created_at>&limit=<n>
 *
 * Success response (200):
 *   { "scenes": [...], "nextCursor"?: "<iso-created_at>" }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const followeeIds = await listFollowing(userId);
  if (followeeIds.length === 0) {
    return response(200, { scenes: [] });
  }

  const qs = event.queryStringParameters ?? {};
  const cursor = parseCursor(qs.cursor);
  if (cursor === null) {
    return response(400, { error: "Invalid cursor: expected ISO 8601 created_at string" });
  }
  const limit = parseLimit(qs.limit);

  const rawItems = await fanOutFolloweeScenes(followeeIds, limit, cursor);
  const pageItems = mergeAndPage(rawItems, limit);

  const scenes = await Promise.all(
    pageItems.map(async (item) => {
      const [thumbnailUrl, ownerAvatarUrl] = await Promise.all([
        presignedThumbnailUrl(item),
        presignedOwnerAvatarUrl(item),
      ]);
      return feedItemFromScene(item, thumbnailUrl, ownerAvatarUrl);
    })
  );

  const body = { scenes };
  if (scenes.length === limit) {
    const oldest = scenes[scenes.length - 1];
    if (oldest?.createdAt) {
      body.nextCursor = oldest.createdAt;
    }
  }

  return response(200, body);
};
