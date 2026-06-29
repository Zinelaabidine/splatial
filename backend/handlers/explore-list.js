"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { feedItemFromScene } = require("../lib/scene-response");
const { ALLOWED_CATEGORIES, normalizeTags } = require("../lib/scene-taxonomy");

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
 * Query: ?cursor=<opaque>&limit=<n>&category=<name>&tag=<slug>
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

  const filterParts = ["attribute_exists(#nm)"];
  const exprNames = { "#nm": "name" };
  const exprValues = { ":pub": { S: "PUBLIC" } };

  const rawCategory = qs.category;
  if (rawCategory !== undefined && rawCategory !== null && rawCategory !== "") {
    if (!ALLOWED_CATEGORIES.has(rawCategory)) {
      return response(400, { error: "category is not allowed" });
    }
    filterParts.push("#cat = :cat");
    exprNames["#cat"] = "category";
    exprValues[":cat"] = { S: rawCategory };
  }

  const rawTag = qs.tag;
  if (rawTag !== undefined && rawTag !== null && rawTag !== "") {
    const tagResult = normalizeTags([rawTag]);
    if (!tagResult.ok || tagResult.tags.length === 0) {
      return response(400, { error: tagResult.ok ? "tag is not valid" : tagResult.error });
    }
    filterParts.push("contains(tags, :tag)");
    exprValues[":tag"] = { S: tagResult.tags[0] };
  }

  // FilterExpression runs post-read on the GSI (MVP). A sparse category GSI is the future upgrade if volume grows.
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "visibility-created_at-index",
      KeyConditionExpression: "visibility = :pub",
      FilterExpression: filterParts.join(" AND "),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
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
