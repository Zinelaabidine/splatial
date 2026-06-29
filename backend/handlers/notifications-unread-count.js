"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { unreadCountFromProfile } = require("../lib/notifications");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;

/**
 * GET /api/v1/notifications/unread-count
 *
 * Return the caller's unread notification count (cheap badge poll).
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const profileResult = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: userId } },
    })
  );

  const unreadCount = unreadCountFromProfile(profileResult.Item);
  return response(200, { unreadCount });
};
