"use strict";

const {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.PRESENCE_TABLE_NAME;

// Refreshed by the heartbeat route; connect sets it this far out too. If a
// tab crashes or loses network without a clean $disconnect firing, the row
// simply expires out of the viewer count within this window.
const CONNECTION_TTL_SECONDS = 120;

function expiresAt() {
  return Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
}

async function recordConnection({ connectionId, sceneId, userId }) {
  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        connection_id: { S: connectionId },
        scene_id: { S: sceneId },
        user_id: { S: userId },
        connected_at: { S: new Date().toISOString() },
        expires_at: { N: String(expiresAt()) },
      },
    })
  );
}

async function getConnection(connectionId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { connection_id: { S: connectionId } },
    })
  );
  return result.Item ?? null;
}

async function removeConnection(connectionId) {
  await dynamo.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: { connection_id: { S: connectionId } },
    })
  );
}

async function refreshConnection(connectionId) {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { connection_id: { S: connectionId } },
      UpdateExpression: "SET expires_at = :exp",
      ConditionExpression: "attribute_exists(connection_id)",
      ExpressionAttributeValues: { ":exp": { N: String(expiresAt()) } },
    })
  );
}

async function listConnectionsForScene(sceneId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "scene_id-index",
      KeyConditionExpression: "scene_id = :sceneId",
      ExpressionAttributeValues: { ":sceneId": { S: sceneId } },
    })
  );
  return result.Items ?? [];
}

module.exports = {
  recordConnection,
  getConnection,
  removeConnection,
  refreshConnection,
  listConnectionsForScene,
};
