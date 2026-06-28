"use strict";

const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

const ALLOWED_INPUT_TYPES = new Set(["video", "images"]);

/**
 * POST /api/v1/scenes
 *
 * Creates a scene record in the UPLOADED state when the user initiates
 * an upload from the dashboard.
 *
 * Request body:
 *   { "name": "My Garden", "inputType": "video" | "images" }
 *
 * Success response (201):
 *   { "sceneId": "...", "name": "...", "inputType": "...", "status": "UPLOADED", "createdAt": "..." }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const { name, inputType } = body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return response(400, { error: "Missing required field: name" });
  }
  if (!inputType || !ALLOWED_INPUT_TYPES.has(inputType)) {
    return response(400, { error: "inputType must be 'video' or 'images'" });
  }

  const sceneId = randomUUID();
  const now = new Date().toISOString();
  const trimmedName = name.trim();

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        scene_id:   { S: sceneId },
        user_id:    { S: userId },
        name:       { S: trimmedName },
        input_type: { S: inputType },
        status:     { S: "UPLOADED" },
        created_at: { S: now },
        updated_at: { S: now },
      },
      ConditionExpression: "attribute_not_exists(scene_id)",
    })
  );

  return response(201, {
    sceneId,
    name: trimmedName,
    inputType,
    status: "UPLOADED",
    createdAt: now,
  });
};
