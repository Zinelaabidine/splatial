"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  buildMinimalProfileItem,
  displayNameFromClaims,
  normalizeUsername,
  profileResponseFromItem,
  validateBio,
  validateDisplayName,
  validateUsername,
} = require("../lib/profile");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const USERNAMES_TABLE = process.env.USERNAMES_TABLE_NAME;

async function getOrCreateProfile(userId, claims) {
  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: userId } },
    })
  );

  if (existing.Item) return existing.Item;

  const now = new Date().toISOString();
  const item = buildMinimalProfileItem(userId, displayNameFromClaims(claims), now);

  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: PROFILES_TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(user_id)",
      })
    );
    return item;
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
    const raced = await dynamo.send(
      new GetItemCommand({
        TableName: PROFILES_TABLE,
        Key: { user_id: { S: userId } },
      })
    );
    if (!raced.Item) throw err;
    return raced.Item;
  }
}

async function claimUsername(username, userId) {
  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: USERNAMES_TABLE,
        Item: {
          username: { S: username },
          user_id: { S: userId },
        },
        ConditionExpression: "attribute_not_exists(username)",
      })
    );
    return { ok: true };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return { ok: false, conflict: true };
    }
    throw err;
  }
}

/**
 * PUT /api/v1/profile/me
 *
 * Updates the caller's profile (username claim/rename, display name, bio).
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

  const hasUsername = body.username !== undefined;
  const hasDisplayName = body.displayName !== undefined;
  const hasBio = body.bio !== undefined;

  if (!hasUsername && !hasDisplayName && !hasBio) {
    return response(400, { error: "Provide at least one of: username, displayName, bio" });
  }

  let normalizedUsername;
  if (hasUsername) {
    const check = validateUsername(body.username);
    if (!check.ok) return response(400, { error: check.error });
    normalizedUsername = check.username;
  }

  let displayName;
  if (hasDisplayName) {
    const check = validateDisplayName(body.displayName);
    if (!check.ok) return response(400, { error: check.error });
    displayName = check.displayName;
  }

  let bio;
  if (hasBio) {
    const check = validateBio(body.bio);
    if (!check.ok) return response(400, { error: check.error });
    bio = check.bio;
  }

  const profile = await getOrCreateProfile(userId, claims);
  const currentUsername = profile.username?.S ?? null;
  const usernameChanging =
    hasUsername && normalizeUsername(normalizedUsername) !== (currentUsername ?? "");

  if (usernameChanging) {
    const claim = await claimUsername(normalizedUsername, userId);
    if (!claim.ok) {
      return response(409, { error: "Username taken" });
    }
  }

  const now = new Date().toISOString();
  const exprParts = ["updated_at = :now"];
  const exprValues = { ":now": { S: now }, ":uid": { S: userId } };
  const exprNames = {};

  if (usernameChanging) {
    exprParts.push("username = :username");
    exprValues[":username"] = { S: normalizedUsername };
  }

  if (hasDisplayName) {
    exprParts.push("#dn = :displayName");
    exprNames["#dn"] = "display_name";
    exprValues[":displayName"] = { S: displayName };
  }

  if (hasBio) {
    exprParts.push("bio = :bio");
    exprValues[":bio"] = { S: bio };
  }

  let updated;
  try {
    const updateResult = await dynamo.send(
      new UpdateItemCommand({
        TableName: PROFILES_TABLE,
        Key: { user_id: { S: userId } },
        UpdateExpression: `SET ${exprParts.join(", ")}`,
        ConditionExpression: "user_id = :uid",
        ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
        ExpressionAttributeValues: exprValues,
        ReturnValues: "ALL_NEW",
      })
    );
    updated = updateResult.Attributes ?? profile;
  } catch (err) {
    if (usernameChanging) {
      await dynamo.send(
        new DeleteItemCommand({
          TableName: USERNAMES_TABLE,
          Key: { username: { S: normalizedUsername } },
          ConditionExpression: "user_id = :uid",
          ExpressionAttributeValues: { ":uid": { S: userId } },
        })
      ).catch(() => {});
    }
    throw err;
  }

  if (usernameChanging && currentUsername) {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: USERNAMES_TABLE,
        Key: { username: { S: currentUsername } },
        ConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": { S: userId } },
      })
    ).catch(() => {});
  }

  const responseBody = await profileResponseFromItem(updated);
  return response(200, responseBody);
};
