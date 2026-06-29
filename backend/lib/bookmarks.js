"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamo = new DynamoDBClient({});
const BOOKMARKS_TABLE = process.env.BOOKMARKS_TABLE_NAME;

async function isBookmarked(userId, sceneId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: BOOKMARKS_TABLE,
      Key: {
        user_id: { S: userId },
        scene_id: { S: sceneId },
      },
      ProjectionExpression: "user_id",
    })
  );
  return Boolean(result.Item);
}

module.exports = {
  isBookmarked,
};
