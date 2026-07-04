"use strict";

const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { sceneResponseFromItem } = require("../lib/scene-response");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;

/**
 * POST /api/v1/scenes/{sceneId}/edit/complete
 *
 * Finalizes an edit: verifies the client uploaded to the exact key we presigned
 * (recorded as pending_edit_key), confirms the object actually landed, then
 * repoints the scene's ply_key at the edited file. ply_key is resolved first by
 * resolveSceneViewObject, so the viewer and view-url endpoint pick up the edit
 * with no further changes and the original trained output stays intact.
 *
 * Request body: { "key": "..." }
 * Success response (200): full updated scene object (includes plyKey).
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const { key } = body;
  if (!key || typeof key !== "string" || key.trim() === "") {
    return response(400, { error: "Missing required field: key" });
  }

  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      ConsistentRead: true,
    })
  );

  const item = existing.Item;
  if (!item) return response(404, { error: "Scene not found" });

  if (item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  if (item.status?.S !== "READY") {
    return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
  }

  if (key !== item.pending_edit_key?.S) {
    return response(400, { error: "key does not match the pending edit for this scene" });
  }

  const bucket = item.pending_edit_bucket?.S ?? SPLAT_BUCKET;

  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    return response(409, { error: "Edited splat upload did not complete — try saving again" });
  }
  if (!(head.ContentLength > 0)) {
    return response(409, { error: "Edited splat upload is empty — try saving again" });
  }

  const now = new Date().toISOString();
  let updateResult;
  try {
    updateResult = await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sceneId } },
        UpdateExpression:
          "SET ply_key = :key, output_bucket = :bucket, updated_at = :now REMOVE pending_edit_key, pending_edit_bucket",
        ConditionExpression: "user_id = :uid AND #s = :ready",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":key": { S: key },
          ":bucket": { S: bucket },
          ":now": { S: now },
          ":uid": { S: userId },
          ":ready": { S: "READY" },
        },
        ReturnValues: "ALL_NEW",
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, { error: "Scene was modified by another request, please retry" });
    }
    throw err;
  }

  return response(200, sceneResponseFromItem(updateResult.Attributes ?? item));
};
