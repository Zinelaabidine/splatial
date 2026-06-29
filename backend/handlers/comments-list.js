"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { listComments } = require("../lib/comments");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;
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
 * GET /api/v1/scenes/{sceneId}/comments
 *
 * List comments on a visible scene, newest first.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: SCENES_TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  const isOwner = item.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(item) === "PUBLIC";
  if (!isOwner && !isPublic) {
    return response(403, { error: "Forbidden: scene is not visible to this user" });
  }

  const qs = event.queryStringParameters ?? {};
  const limit = parseLimit(qs.limit);
  const exclusiveStartKey = decodeCursor(qs.cursor);

  const { comments, lastEvaluatedKey } = await listComments({
    sceneId,
    limit,
    exclusiveStartKey,
  });

  const nextCursor = encodeCursor(lastEvaluatedKey);
  return response(200, {
    comments,
    ...(nextCursor ? { nextCursor } : {}),
  });
};
