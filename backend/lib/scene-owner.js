"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamo = new DynamoDBClient({});
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;

async function getOwnerProfile(userId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: userId } },
    })
  );
  return result.Item ?? null;
}

function ownerFieldsFromProfile(profileItem, userId) {
  const fields = {
    owner_user_id: { S: userId },
    owner_username: { S: profileItem.username?.S ?? "" },
    owner_display_name: { S: profileItem.display_name?.S ?? "" },
  };

  if (profileItem.avatar_key?.S) {
    fields.owner_avatar_key = { S: profileItem.avatar_key.S };
  }
  if (profileItem.avatar_bucket?.S) {
    fields.owner_avatar_bucket = { S: profileItem.avatar_bucket.S };
  }

  return fields;
}

function buildOwnerRefreshUpdate(profileItem, userId) {
  const setParts = [
    "owner_user_id = :ownerUserId",
    "owner_username = :ownerUsername",
    "owner_display_name = :ownerDisplayName",
  ];
  const values = {
    ":ownerUserId": { S: userId },
    ":ownerUsername": { S: profileItem.username?.S ?? "" },
    ":ownerDisplayName": { S: profileItem.display_name?.S ?? "" },
  };
  const removeParts = [];

  if (profileItem.avatar_key?.S && profileItem.avatar_bucket?.S) {
    setParts.push("owner_avatar_key = :ownerAvatarKey");
    setParts.push("owner_avatar_bucket = :ownerAvatarBucket");
    values[":ownerAvatarKey"] = { S: profileItem.avatar_key.S };
    values[":ownerAvatarBucket"] = { S: profileItem.avatar_bucket.S };
  } else {
    removeParts.push("owner_avatar_key", "owner_avatar_bucket");
  }

  return { setParts, removeParts, values };
}

async function adjustPublicScenesCount(userId, delta) {
  if (delta === 0) return;

  const now = new Date().toISOString();

  if (delta > 0) {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: PROFILES_TABLE,
        Key: { user_id: { S: userId } },
        UpdateExpression:
          "SET scenes_count = if_not_exists(scenes_count, :zero) + :delta, updated_at = :now",
        ExpressionAttributeValues: {
          ":delta": { N: String(delta) },
          ":zero": { N: "0" },
          ":now": { S: now },
        },
      })
    );
    return;
  }

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: PROFILES_TABLE,
        Key: { user_id: { S: userId } },
        UpdateExpression:
          "SET scenes_count = if_not_exists(scenes_count, :zero) + :delta, updated_at = :now",
        ConditionExpression: "if_not_exists(scenes_count, :zero) >= :one",
        ExpressionAttributeValues: {
          ":delta": { N: String(delta) },
          ":zero": { N: "0" },
          ":one": { N: "1" },
          ":now": { S: now },
        },
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
  }
}

module.exports = {
  adjustPublicScenesCount,
  buildOwnerRefreshUpdate,
  getOwnerProfile,
  ownerFieldsFromProfile,
};
