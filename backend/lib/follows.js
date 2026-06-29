"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} = require("@aws-sdk/client-dynamodb");
const { counterValue } = require("./profile");

const dynamo = new DynamoDBClient({});
const FOLLOWS_TABLE = process.env.FOLLOWS_TABLE_NAME;
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;

/** MVP cap — listFollowing stops paging once this many followees are collected. */
const MAX_FOLLOWING = 500;

async function getFollowersCount(followeeId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: followeeId } },
    })
  );
  return counterValue(result.Item, "followers_count");
}

/**
 * Returns followee_id strings for everyone the given user follows.
 * Pages internally until all rows are read or MAX_FOLLOWING is reached.
 */
async function listFollowing(followerId, limit) {
  const cap = Math.min(typeof limit === "number" && limit > 0 ? limit : MAX_FOLLOWING, MAX_FOLLOWING);
  const followeeIds = [];
  let exclusiveStartKey;

  while (followeeIds.length < cap) {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: FOLLOWS_TABLE,
        KeyConditionExpression: "follower_id = :me",
        ExpressionAttributeValues: { ":me": { S: followerId } },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: Math.min(100, cap - followeeIds.length),
      })
    );

    for (const item of result.Items ?? []) {
      const id = item.followee_id?.S;
      if (id) followeeIds.push(id);
    }

    if (!result.LastEvaluatedKey || followeeIds.length >= cap) break;
    exclusiveStartKey = result.LastEvaluatedKey;
  }

  return followeeIds;
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
      return { following: true, followersCount, created: false };
    }
    throw err;
  }

  const followersCount = await getFollowersCount(followeeId);
  return { following: true, followersCount, created: true };
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
  listFollowing,
  MAX_FOLLOWING,
};
