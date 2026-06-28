"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const TABLE = process.env.SCENES_TABLE_NAME;

/**
 * POST /jobs/{sceneId}/cancel
 *
 * Transitions a QUEUED or PROCESSING scene to CANCELLED.
 * The SQS worker checks DynamoDB status before processing — a CANCELLED
 * message is deleted from the queue without running the training job.
 *
 * Success response (200): { "sceneId": "...", "attemptId": "...", "status": "CANCELLED" }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: sceneId } } })
  );
  if (!Item) return response(404, { error: "Scene not found" });
  if (Item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  const lastAttemptId = Item.last_attempt_id?.S ?? null;
  const now = new Date().toISOString();

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sceneId } },
        UpdateExpression: "SET #s = :cancelled, updated_at = :now",
        ConditionExpression: "user_id = :uid AND #s IN (:q, :p)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":cancelled": { S: "CANCELLED" },
          ":now":        { S: now },
          ":uid":        { S: userId },
          ":q":          { S: "QUEUED" },
          ":p":          { S: "PROCESSING" },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "Scene not in a cancellable state" });
    }
    throw err;
  }

  if (lastAttemptId) {
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { scene_id: { S: lastAttemptId } },
          UpdateExpression: "SET #s = :cancelled, updated_at = :now",
          ConditionExpression: "#s IN (:q, :p)",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":cancelled": { S: "CANCELLED" },
            ":now":        { S: now },
            ":q":          { S: "QUEUED" },
            ":p":          { S: "PROCESSING" },
          },
        })
      );
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
    }
  }

  return response(200, { sceneId, attemptId: lastAttemptId, status: "CANCELLED" });
};
