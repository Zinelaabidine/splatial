"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { unfollowUser } = require("../lib/follows");
const { validateUsername, resolveUserIdByUsername } = require("../lib/profile");

const dynamo = new DynamoDBClient({});

/**
 * DELETE /api/v1/profiles/{username}/follow
 *
 * Atomically remove a follow edge and decrement both profile counters.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const followerId = claims?.sub;
  if (!followerId) return response(401, { error: "Unauthorized: missing user identity" });

  const rawUsername = event.pathParameters?.username;
  if (!rawUsername || typeof rawUsername !== "string" || rawUsername.trim() === "") {
    return response(400, { error: "Missing path parameter: username" });
  }

  const check = validateUsername(rawUsername);
  if (!check.ok) return response(404, { error: "Profile not found" });
  const username = check.username;

  const followeeId = await resolveUserIdByUsername(dynamo, username);
  if (!followeeId) return response(404, { error: "Profile not found" });

  const result = await unfollowUser(followerId, followeeId);
  return response(200, result);
};
