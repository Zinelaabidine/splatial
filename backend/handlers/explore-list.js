"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { feedItemFromScene } = require("../lib/scene-response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
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

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function encodeCursor(key) {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64");
}

function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === "") return undefined;
  if (typeof cursor !== "string" || cursor.trim() === "") return undefined;
  try {
    return JSON.parse(Buffer.from(cursor.trim(), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/explore
 *
 * Returns newest public scenes (newest-only; trending deferred until engagement signals exist).
 *
 * Query: ?cursor=<opaque>&limit=<n>
 *
 * Success response (200):
 *   { "scenes": [...], "nextCursor"?: "<opaque>" }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const qs = event.queryStringParameters ?? {};
  const exclusiveStartKey = decodeCursor(qs.cursor);
  if (exclusiveStartKey === null) {
    return response(400, { error: "Invalid cursor" });
  }
  const limit = parseLimit(qs.limit);

  // Index projection is ALL — owner_* and thumbnail_* are on the item; no extra GetItem.
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "visibility-created_at-index",
      KeyConditionExpression: "visibility = :pub",
      FilterExpression: "attribute_exists(#nm)",
      ExpressionAttributeNames: { "#nm": "name" },
      ExpressionAttributeValues: { ":pub": { S: "PUBLIC" } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const scenes = await Promise.all(
    (result.Items ?? []).map(async (item) => {
      const [thumbnailUrl, ownerAvatarUrl] = await Promise.all([
        presignedThumbnailUrl(item),
        presignedOwnerAvatarUrl(item),
      ]);
      return feedItemFromScene(item, thumbnailUrl, ownerAvatarUrl);
    })
  );

  const nextCursor = encodeCursor(result.LastEvaluatedKey);
  return response(200, {
    scenes,
    ...(nextCursor ? { nextCursor } : {}),
  });
};
