"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  buildMinimalProfileItem,
  displayNameFromClaims,
  emailFromClaims,
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

  const email = emailFromClaims(claims);

  if (existing.Item) {
    // Keep the cached email fresh (used for outbound notification emails —
    // see lib/email.js) without requiring a dedicated update endpoint.
    if (email && existing.Item.email?.S !== email) {
      await dynamo
        .send(
          new UpdateItemCommand({
            TableName: PROFILES_TABLE,
            Key: { user_id: { S: userId } },
            UpdateExpression: "SET email = :email",
            ExpressionAttributeValues: { ":email": { S: email } },
          })
        )
        .catch(() => {});
      existing.Item.email = { S: email };
    }
    const body = await profileResponseFromItem(existing.Item, true);
    return response(200, body);
  }

  const now = new Date().toISOString();
  const displayName = displayNameFromClaims(claims);
  const item = buildMinimalProfileItem(userId, displayName, now, email);

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
    const body = await profileResponseFromItem(raced.Item, true);
    return response(200, body);
  }

  const body = await profileResponseFromItem(item, true);
  return response(200, body);
};
