"use strict";

const { DynamoDBClient, DeleteItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const response = require("../lib/response");

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});

const TABLE = process.env.SCENES_TABLE_NAME;
const BUCKET = process.env.RAW_SCENES_BUCKET_NAME;

/**
 * DELETE /scenes/{sceneId}
 *
 * Removes a scene owned by the caller: deletes the DynamoDB record and the
 * corresponding S3 object (if present). Safe to call on scenes in any status.
 *
 * Success response (200):
 *   { "sceneId": "...", "deleted": true }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId) return response(400, { error: "Missing path parameter: sceneId" });

  // Fetch first to verify ownership and get the S3 key.
  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = existing.Item;
  if (!item) return response(404, { error: "Scene not found" });

  if (item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  // Best-effort S3 cleanup — don't fail the request if the object is already gone.
  const s3Key = item.s3_key?.S ?? item.s3_location?.S;
  if (s3Key) {
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key })
      );
    } catch (err) {
      console.warn("s3 delete skipped", { sceneId, s3Key, err: err.message });
    }
  }

  await dynamo.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      ConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": { S: userId } },
    })
  );

  return response(200, { sceneId, deleted: true });
};
