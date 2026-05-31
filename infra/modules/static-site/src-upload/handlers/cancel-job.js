"use strict";

const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
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
 * Success response (200): { "sceneId": "...", "status": "CANCELLED" }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId) return response(400, { error: "Missing path parameter: sceneId" });

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
          ":now":        { S: new Date().toISOString() },
          ":uid":        { S: userId },
          ":q":          { S: "QUEUED" },
          ":p":          { S: "PROCESSING" },
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "Scene not found, not owned by user, or not in a cancellable state" });
    }
    throw err;
  }

  return response(200, { sceneId, status: "CANCELLED" });
};
