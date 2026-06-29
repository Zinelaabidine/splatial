"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { validateUsername, resolveUserIdByUsername } = require("../lib/profile");
const { sceneResponseFromItem } = require("../lib/scene-response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;
const DEFAULT_LIMIT = 24;

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

/**
 * GET /api/v1/profiles/{username}/scenes
 *
 * Returns a paginated list of public scenes owned by the profile user.
 *
 * Query: ?cursor=<opaque>
 *
 * Success response (200):
 *   { "scenes": [...], "nextCursor"?: "<opaque>" }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const rawUsername = event.pathParameters?.username;
  if (!rawUsername || typeof rawUsername !== "string" || rawUsername.trim() === "") {
    return response(400, { error: "Missing path parameter: username" });
  }

  const check = validateUsername(rawUsername);
  if (!check.ok) return response(404, { error: "Profile not found" });
  const username = check.username;

  const ownerId = await resolveUserIdByUsername(dynamo, username);
  if (!ownerId) return response(404, { error: "Profile not found" });

  const qs = event.queryStringParameters ?? {};
  const exclusiveStartKey = decodeCursor(qs.cursor);

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "public_owner-created_at-index",
      KeyConditionExpression: "public_owner_id = :owner",
      FilterExpression: "attribute_exists(#nm)",
      ExpressionAttributeNames: { "#nm": "name" },
      ExpressionAttributeValues: { ":owner": { S: ownerId } },
      ScanIndexForward: false,
      Limit: DEFAULT_LIMIT,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const scenes = await Promise.all(
    (result.Items ?? []).map(async (item) => {
      const thumbnailUrl = await presignedThumbnailUrl(item);
      return sceneResponseFromItem(item, thumbnailUrl);
    })
  );

  const nextCursor = encodeCursor(result.LastEvaluatedKey);
  return response(200, {
    scenes,
    ...(nextCursor ? { nextCursor } : {}),
  });
};
