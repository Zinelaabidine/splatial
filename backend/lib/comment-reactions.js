"use strict";

/**
 * Reactions on individual comments (as opposed to lib/reactions.js, which
 * reacts to whole scenes). Same reaction vocabulary (see reaction-types.js),
 * separate DynamoDB table (comment-reactions.tf) keyed by comment_id since
 * comment_id is already globally unique (created_at#uuid, see lib/comments.js).
 * Counters (rc_<type>, reactions_total) are denormalized directly onto the
 * comment item in the comments table.
 */

const {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  BatchGetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { ALLOWED_REACTIONS } = require("./reaction-types");

const dynamo = new DynamoDBClient({});
const COMMENT_REACTIONS_TABLE = process.env.COMMENT_REACTIONS_TABLE_NAME;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE_NAME;

const REACTION_TYPE_LIST = [...ALLOWED_REACTIONS];
const BATCH_GET_MAX_KEYS = 100;

function counterAttr(type) {
  return `rc_${type}`;
}

function counterValue(item, attr) {
  return Number(item?.[attr]?.N ?? 0);
}

function isTransactionCanceledForCondition(err, transactItemIndex) {
  if (err.name !== "TransactionCanceledException") return false;
  const reason = err.CancellationReasons?.[transactItemIndex];
  return reason?.Code === "ConditionalCheckFailed";
}

function reactionCountsFromCommentItem(item) {
  const counts = {};
  for (const type of REACTION_TYPE_LIST) {
    counts[type] = counterValue(item, counterAttr(type));
  }
  return counts;
}

function reactionSummaryFromCommentItem(item, myReaction) {
  return {
    reactionCounts: reactionCountsFromCommentItem(item),
    reactionsTotal: counterValue(item, "reactions_total"),
    myReaction: myReaction ?? null,
  };
}

async function getCommentItem(sceneId, commentId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: COMMENTS_TABLE,
      Key: { scene_id: { S: sceneId }, comment_id: { S: commentId } },
    })
  );
  return result.Item ?? null;
}

async function getExistingCommentReaction(commentId, userId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: COMMENT_REACTIONS_TABLE,
      Key: { comment_id: { S: commentId }, user_id: { S: userId } },
    })
  );
  return result.Item ?? null;
}

async function getCommentReaction(commentId, userId) {
  const item = await getExistingCommentReaction(commentId, userId);
  return item?.reaction_type?.S ?? null;
}

/**
 * Batch-fetch the caller's reaction across many comments in one or few round
 * trips (BatchGetItem caps at 100 keys) — used by listComments/listReplies so
 * rendering a page of comments doesn't fan out into one GetItem per row.
 */
async function getUserReactionsForComments(commentIds, userId) {
  const out = {};
  if (!commentIds.length || !userId) return out;

  for (let i = 0; i < commentIds.length; i += BATCH_GET_MAX_KEYS) {
    const chunk = commentIds.slice(i, i + BATCH_GET_MAX_KEYS);
    const result = await dynamo.send(
      new BatchGetItemCommand({
        RequestItems: {
          [COMMENT_REACTIONS_TABLE]: {
            Keys: chunk.map((commentId) => ({
              comment_id: { S: commentId },
              user_id: { S: userId },
            })),
          },
        },
      })
    );
    for (const row of result.Responses?.[COMMENT_REACTIONS_TABLE] ?? []) {
      const commentId = row.comment_id?.S;
      if (commentId) out[commentId] = row.reaction_type?.S ?? null;
    }
  }

  return out;
}

async function setCommentReaction({ sceneId, commentId, userId, type }) {
  if (!ALLOWED_REACTIONS.has(type)) {
    const err = new Error("Invalid reaction type");
    err.statusCode = 400;
    throw err;
  }

  const existing = await getExistingCommentReaction(commentId, userId);
  const existingType = existing?.reaction_type?.S ?? null;

  if (existingType === type) {
    const item = await getCommentItem(sceneId, commentId);
    return { ...reactionSummaryFromCommentItem(item, type), added: false };
  }

  const now = new Date().toISOString();
  const newAttr = counterAttr(type);
  let added = false;

  if (!existingType) {
    try {
      await dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: COMMENT_REACTIONS_TABLE,
                Item: {
                  comment_id: { S: commentId },
                  user_id: { S: userId },
                  reaction_type: { S: type },
                  created_at: { S: now },
                },
                ConditionExpression: "attribute_not_exists(user_id)",
              },
            },
            {
              Update: {
                TableName: COMMENTS_TABLE,
                Key: { scene_id: { S: sceneId }, comment_id: { S: commentId } },
                UpdateExpression: `SET ${newAttr} = if_not_exists(${newAttr}, :zero) + :one, reactions_total = if_not_exists(reactions_total, :zero) + :one`,
                ConditionExpression: "attribute_exists(comment_id)",
                ExpressionAttributeValues: {
                  ":zero": { N: "0" },
                  ":one": { N: "1" },
                },
              },
            },
          ],
        })
      );
      added = true;
    } catch (err) {
      if (isTransactionCanceledForCondition(err, 1)) {
        const notFound = new Error("Comment not found");
        notFound.statusCode = 404;
        throw notFound;
      }
      if (isTransactionCanceledForCondition(err, 0)) {
        const item = await getCommentItem(sceneId, commentId);
        const myReaction = await getCommentReaction(commentId, userId);
        return { ...reactionSummaryFromCommentItem(item, myReaction), added: false };
      }
      throw err;
    }
  } else {
    const oldAttr = counterAttr(existingType);
    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: COMMENT_REACTIONS_TABLE,
              Item: {
                comment_id: { S: commentId },
                user_id: { S: userId },
                reaction_type: { S: type },
                created_at: { S: now },
              },
            },
          },
          {
            Update: {
              TableName: COMMENTS_TABLE,
              Key: { scene_id: { S: sceneId }, comment_id: { S: commentId } },
              UpdateExpression: `SET ${oldAttr} = if_not_exists(${oldAttr}, :zero) + :minusOne, ${newAttr} = if_not_exists(${newAttr}, :zero) + :one`,
              ConditionExpression: `if_not_exists(${oldAttr}, :zero) >= :one`,
              ExpressionAttributeValues: {
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":minusOne": { N: "-1" },
              },
            },
          },
        ],
      })
    );
  }

  const item = await getCommentItem(sceneId, commentId);
  return { ...reactionSummaryFromCommentItem(item, type), added };
}

async function removeCommentReaction({ sceneId, commentId, userId }) {
  const existing = await getExistingCommentReaction(commentId, userId);
  if (!existing) {
    const item = await getCommentItem(sceneId, commentId);
    return reactionSummaryFromCommentItem(item, null);
  }

  const type = existing.reaction_type?.S;
  if (!type || !ALLOWED_REACTIONS.has(type)) {
    const item = await getCommentItem(sceneId, commentId);
    return reactionSummaryFromCommentItem(item, null);
  }

  const attr = counterAttr(type);

  try {
    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: COMMENT_REACTIONS_TABLE,
              Key: { comment_id: { S: commentId }, user_id: { S: userId } },
              ConditionExpression: "attribute_exists(user_id)",
            },
          },
          {
            Update: {
              TableName: COMMENTS_TABLE,
              Key: { scene_id: { S: sceneId }, comment_id: { S: commentId } },
              UpdateExpression: `SET ${attr} = if_not_exists(${attr}, :zero) + :minusOne, reactions_total = if_not_exists(reactions_total, :zero) + :minusOne`,
              ConditionExpression:
                "if_not_exists(#attr, :zero) >= :one AND if_not_exists(reactions_total, :zero) >= :one",
              ExpressionAttributeNames: { "#attr": attr },
              ExpressionAttributeValues: {
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":minusOne": { N: "-1" },
              },
            },
          },
        ],
      })
    );
  } catch (err) {
    if (isTransactionCanceledForCondition(err, 0)) {
      const item = await getCommentItem(sceneId, commentId);
      return reactionSummaryFromCommentItem(item, null);
    }
    throw err;
  }

  const item = await getCommentItem(sceneId, commentId);
  return reactionSummaryFromCommentItem(item, null);
}

module.exports = {
  getCommentReaction,
  getUserReactionsForComments,
  reactionCountsFromCommentItem,
  reactionSummaryFromCommentItem,
  setCommentReaction,
  removeCommentReaction,
};
