"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  profileResponseFromItem,
  validateUsername,
  resolveUserIdByUsername,
} = require("../lib/profile");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;

/**
 * GET /api/v1/profiles/{username}
 *
 * Public profile lookup by handle.
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

  const profile = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: ownerId } },
    })
  );

  if (!profile.Item?.username?.S) {
    return response(404, { error: "Profile not found" });
  }

  const body = await profileResponseFromItem(profile.Item);
  return response(200, body);
};
