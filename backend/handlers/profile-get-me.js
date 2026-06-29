"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  buildMinimalProfileItem,
  displayNameFromClaims,
  profileResponseFromItem,
} = require("../lib/profile");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;

/**
 * GET /api/v1/profile/me
 *
 * Returns the caller's profile, lazily creating a minimal record if absent.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: userId } },
    })
  );

  if (existing.Item) {
    const body = await profileResponseFromItem(existing.Item);
    return response(200, body);
  }

  const now = new Date().toISOString();
  const displayName = displayNameFromClaims(claims);
  const item = buildMinimalProfileItem(userId, displayName, now);

  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: PROFILES_TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(user_id)",
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;

    const raced = await dynamo.send(
      new GetItemCommand({
        TableName: PROFILES_TABLE,
        Key: { user_id: { S: userId } },
      })
    );
    if (!raced.Item) throw err;
    const body = await profileResponseFromItem(raced.Item);
    return response(200, body);
  }

  const body = await profileResponseFromItem(item);
  return response(200, body);
};
