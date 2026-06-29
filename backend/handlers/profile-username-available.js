"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { validateUsername } = require("../lib/profile");

const dynamo = new DynamoDBClient({});
const USERNAMES_TABLE = process.env.USERNAMES_TABLE_NAME;

/**
 * GET /api/v1/profile/username-available/{username}
 *
 * Checks whether a handle is available for claim.
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
  if (!check.ok) {
    return response(200, { available: false });
  }

  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: USERNAMES_TABLE,
      Key: { username: { S: check.username } },
    })
  );

  if (!existing.Item) {
    return response(200, { available: true });
  }

  const available = existing.Item.user_id?.S === userId;
  return response(200, { available });
};
