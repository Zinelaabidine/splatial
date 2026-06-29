"use strict";

const {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
} = require("@aws-sdk/client-dynamodb");
const { ALLOWED_REACTIONS } = require("./reaction-types");

const dynamo = new DynamoDBClient({});
const REACTIONS_TABLE = process.env.REACTIONS_TABLE_NAME;
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

const REACTION_TYPE_LIST = [...ALLOWED_REACTIONS];

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

function reactionCountsFromSceneItem(item) {
  const counts = {};
  for (const type of REACTION_TYPE_LIST) {
    counts[type] = counterValue(item, counterAttr(type));
  }
  return counts;
}

function reactionSummaryFromSceneItem(sceneItem, myReaction) {
  return {
    reactionCounts: reactionCountsFromSceneItem(sceneItem),
    reactionsTotal: counterValue(sceneItem, "reactions_total"),
    myReaction: myReaction ?? null,
  };
}

async function getSceneItem(sceneId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: SCENES_TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );
  return result.Item ?? null;
}

async function getReaction(sceneId, userId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: REACTIONS_TABLE,
      Key: {
        scene_id: { S: sceneId },
        user_id: { S: userId },
      },
    })
  );
  return result.Item?.reaction_type?.S ?? null;
}

async function getExistingReaction(sceneId, userId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: REACTIONS_TABLE,
      Key: {
        scene_id: { S: sceneId },
        user_id: { S: userId },
      },
    })
  );
  return result.Item ?? null;
}

async function setReaction(sceneId, userId, type) {
  if (!ALLOWED_REACTIONS.has(type)) {
    const err = new Error("Invalid reaction type");
    err.statusCode = 400;
    throw err;
  }

  const existing = await getExistingReaction(sceneId, userId);
  const existingType = existing?.reaction_type?.S ?? null;

  if (existingType === type) {
    const sceneItem = await getSceneItem(sceneId);
    return { ...reactionSummaryFromSceneItem(sceneItem, type), added: false };
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
                TableName: REACTIONS_TABLE,
                Item: {
                  scene_id: { S: sceneId },
                  user_id: { S: userId },
                  reaction_type: { S: type },
                  created_at: { S: now },
                },
                ConditionExpression: "attribute_not_exists(user_id)",
              },
            },
            {
              Update: {
                TableName: SCENES_TABLE,
                Key: { scene_id: { S: sceneId } },
                UpdateExpression: `SET ${newAttr} = if_not_exists(${newAttr}, :zero) + :one, reactions_total = if_not_exists(reactions_total, :zero) + :one`,
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
      if (isTransactionCanceledForCondition(err, 0)) {
        const sceneItem = await getSceneItem(sceneId);
        const myReaction = await getReaction(sceneId, userId);
        return { ...reactionSummaryFromSceneItem(sceneItem, myReaction), added: false };
      }
      throw err;
    }
  } else {
    const oldAttr = counterAttr(existingType);
    try {
      await dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: REACTIONS_TABLE,
                Item: {
                  scene_id: { S: sceneId },
                  user_id: { S: userId },
                  reaction_type: { S: type },
                  created_at: { S: now },
                },
              },
            },
            {
              Update: {
                TableName: SCENES_TABLE,
                Key: { scene_id: { S: sceneId } },
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
    } catch (err) {
      throw err;
    }
  }

  const sceneItem = await getSceneItem(sceneId);
  return { ...reactionSummaryFromSceneItem(sceneItem, type), added };
}

async function removeReaction(sceneId, userId) {
  const existing = await getExistingReaction(sceneId, userId);
  if (!existing) {
    const sceneItem = await getSceneItem(sceneId);
    return reactionSummaryFromSceneItem(sceneItem, null);
  }

  const type = existing.reaction_type?.S;
  if (!type || !ALLOWED_REACTIONS.has(type)) {
    const sceneItem = await getSceneItem(sceneId);
    return reactionSummaryFromSceneItem(sceneItem, null);
  }

  const attr = counterAttr(type);

  try {
    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: REACTIONS_TABLE,
              Key: {
                scene_id: { S: sceneId },
                user_id: { S: userId },
              },
              ConditionExpression: "attribute_exists(user_id)",
            },
          },
          {
            Update: {
              TableName: SCENES_TABLE,
              Key: { scene_id: { S: sceneId } },
              UpdateExpression: `SET ${attr} = if_not_exists(${attr}, :zero) + :minusOne, reactions_total = if_not_exists(reactions_total, :zero) + :minusOne`,
              ConditionExpression:
                "if_not_exists(#attr, :zero) >= :one AND if_not_exists(reactions_total, :zero) >= :one",
              ExpressionAttributeNames: {
                "#attr": attr,
              },
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
      const sceneItem = await getSceneItem(sceneId);
      return reactionSummaryFromSceneItem(sceneItem, null);
    }
    throw err;
  }

  const sceneItem = await getSceneItem(sceneId);
  return reactionSummaryFromSceneItem(sceneItem, null);
}

module.exports = {
  ALLOWED_REACTIONS,
  getReaction,
  reactionCountsFromSceneItem,
  reactionSummaryFromSceneItem,
  removeReaction,
  setReaction,
};
