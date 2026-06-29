"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
} = require("@aws-sdk/client-dynamodb");
const { counterValue } = require("./profile");

const dynamo = new DynamoDBClient({});
const FOLLOWS_TABLE = process.env.FOLLOWS_TABLE_NAME;
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;

async function getFollowersCount(followeeId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: followeeId } },
    })
  );
  return counterValue(result.Item, "followers_count");
}

async function isFollowing(followerId, followeeId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: FOLLOWS_TABLE,
      Key: {
        follower_id: { S: followerId },
        followee_id: { S: followeeId },
      },
    })
  );
  return !!result.Item;
}

function isTransactionCanceledForCondition(err, transactItemIndex) {
  if (err.name !== "TransactionCanceledException") return false;
  const reason = err.CancellationReasons?.[transactItemIndex];
  return reason?.Code === "ConditionalCheckFailed";
}

async function followUser(followerId, followeeId) {
  const now = new Date().toISOString();

  try {
    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: FOLLOWS_TABLE,
              Item: {
                follower_id: { S: followerId },
                followee_id: { S: followeeId },
                created_at: { S: now },
              },
              ConditionExpression: "attribute_not_exists(follower_id)",
            },
          },
          {
            Update: {
              TableName: PROFILES_TABLE,
              Key: { user_id: { S: followeeId } },
              UpdateExpression:
                "SET followers_count = if_not_exists(followers_count, :zero) + :one, updated_at = :now",
              ExpressionAttributeValues: {
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":now": { S: now },
              },
            },
          },
          {
            Update: {
              TableName: PROFILES_TABLE,
              Key: { user_id: { S: followerId } },
              UpdateExpression:
                "SET following_count = if_not_exists(following_count, :zero) + :one, updated_at = :now",
              ExpressionAttributeValues: {
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":now": { S: now },
              },
            },
          },
        ],
      })
    );
  } catch (err) {
    if (isTransactionCanceledForCondition(err, 0)) {
      const followersCount = await getFollowersCount(followeeId);
      return { following: true, followersCount };
    }
    throw err;
  }

  const followersCount = await getFollowersCount(followeeId);
  return { following: true, followersCount };
}

async function unfollowUser(followerId, followeeId) {
  const now = new Date().toISOString();

  try {
    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: FOLLOWS_TABLE,
              Key: {
                follower_id: { S: followerId },
                followee_id: { S: followeeId },
              },
              ConditionExpression: "attribute_exists(follower_id)",
            },
          },
          {
            Update: {
              TableName: PROFILES_TABLE,
              Key: { user_id: { S: followeeId } },
              UpdateExpression:
                "SET followers_count = if_not_exists(followers_count, :zero) + :delta, updated_at = :now",
              ConditionExpression: "if_not_exists(followers_count, :zero) >= :one",
              ExpressionAttributeValues: {
                ":delta": { N: "-1" },
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":now": { S: now },
              },
            },
          },
          {
            Update: {
              TableName: PROFILES_TABLE,
              Key: { user_id: { S: followerId } },
              UpdateExpression:
                "SET following_count = if_not_exists(following_count, :zero) + :delta, updated_at = :now",
              ConditionExpression: "if_not_exists(following_count, :zero) >= :one",
              ExpressionAttributeValues: {
                ":delta": { N: "-1" },
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":now": { S: now },
              },
            },
          },
        ],
      })
    );
  } catch (err) {
    if (isTransactionCanceledForCondition(err, 0)) {
      const followersCount = await getFollowersCount(followeeId);
      return { following: false, followersCount };
    }
    throw err;
  }

  const followersCount = await getFollowersCount(followeeId);
  return { following: false, followersCount };
}

module.exports = {
  followUser,
  unfollowUser,
  isFollowing,
  getFollowersCount,
};
