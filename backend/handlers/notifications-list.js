"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  listNotifications,
  notificationFromItem,
  unreadCountFromProfile,
  lastReadAtFromProfile,
} = require("../lib/notifications");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

/**
 * GET /api/v1/notifications?cursor=&limit=
 *
 * List the caller's notifications, newest first.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const qs = event.queryStringParameters ?? {};
  const limit = parseLimit(qs.limit);
  const exclusiveStartKey = decodeCursor(qs.cursor);

  const profileResult = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: userId } },
    })
  );

  const profileItem = profileResult.Item;
  const unreadCount = unreadCountFromProfile(profileItem);
  const lastReadAt = lastReadAtFromProfile(profileItem);

  const { items, lastEvaluatedKey } = await listNotifications({
    userId,
    limit,
    exclusiveStartKey,
  });

  const notifications = await Promise.all(
    items.map((item) => notificationFromItem(item, lastReadAt))
  );

  const nextCursor = encodeCursor(lastEvaluatedKey);
  return response(200, {
    notifications,
    unreadCount,
    ...(nextCursor ? { nextCursor } : {}),
  });
};
