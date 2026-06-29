"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  DynamoDBClient,
  QueryCommand,
  BatchGetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { feedItemFromScene, sceneVisibilityFromItem } = require("../lib/scene-response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const BOOKMARKS_TABLE = process.env.BOOKMARKS_TABLE_NAME;
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const BOOKMARKS_GSI = "user_id-added_at-index";
const URL_TTL_S = 3600;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

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

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function isSceneVisibleToUser(item, userId) {
  const isOwner = item.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(item) === "PUBLIC";
  return isOwner || isPublic;
}

async function batchGetScenes(sceneIds) {
  if (sceneIds.length === 0) return new Map();

  const batch = await dynamo.send(
    new BatchGetItemCommand({
      RequestItems: {
        [SCENES_TABLE]: {
          Keys: sceneIds.map((sceneId) => ({ scene_id: { S: sceneId } })),
        },
      },
    })
  );

  const byId = new Map();
  for (const item of batch.Responses?.[SCENES_TABLE] ?? []) {
    const sceneId = item.scene_id?.S;
    if (sceneId) byId.set(sceneId, item);
  }
  return byId;
}

/**
 * GET /api/v1/bookmarks?cursor=&limit=
 *
 * List the caller's saved scenes, newest first.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const qs = event.queryStringParameters ?? {};
  const limit = parseLimit(qs.limit);
  const exclusiveStartKey = decodeCursor(qs.cursor);
  if (qs.cursor && !exclusiveStartKey) {
    return response(400, { error: "Invalid cursor" });
  }

  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: BOOKMARKS_TABLE,
      IndexName: BOOKMARKS_GSI,
      KeyConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": { S: userId } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const bookmarkRows = queryResult.Items ?? [];
  const sceneIds = bookmarkRows
    .map((row) => row.scene_id?.S)
    .filter((id) => typeof id === "string" && id !== "");

  const scenesById = await batchGetScenes(sceneIds);

  const visibleItems = [];
  for (const sceneId of sceneIds) {
    const item = scenesById.get(sceneId);
    if (item && isSceneVisibleToUser(item, userId)) {
      visibleItems.push(item);
    }
  }

  const scenes = await Promise.all(
    visibleItems.map(async (item) => {
      const [thumbnailUrl, ownerAvatarUrl] = await Promise.all([
        presignedThumbnailUrl(item),
        presignedOwnerAvatarUrl(item),
      ]);
      return feedItemFromScene(item, thumbnailUrl, ownerAvatarUrl);
    })
  );

  const nextCursor = encodeCursor(queryResult.LastEvaluatedKey);
  return response(200, {
    scenes,
    ...(nextCursor ? { nextCursor } : {}),
  });
};
