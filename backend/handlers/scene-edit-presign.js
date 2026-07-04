"use strict";

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { resolveSceneViewObject } = require("../lib/scene-view-key");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;
const EDIT_CONTENT_TYPE = "application/octet-stream";

/**
 * POST /api/v1/scenes/{sceneId}/edit/presign
 *
 * Issues a presigned PUT URL so the browser-side splat editor can upload the
 * edited .splat to a NEW key under the scene's output prefix (non-destructive —
 * the original trained artifact is left untouched). Records the target key on
 * the scene item as pending_edit_key so the /edit/complete step can verify the
 * client did not tamper with the destination before repointing ply_key at it.
 *
 * Success response (200):
 *   { "sceneId": "...", "key": "...", "putUrl": "https://...", "expiresIn": 3600 }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      ConsistentRead: true,
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  if (item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  if (item.status?.S !== "READY") {
    return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
  }

  const viewObject = await resolveSceneViewObject(item, SPLAT_BUCKET);
  if (!viewObject) {
    return response(409, { error: "Scene has no viewable splat file associated" });
  }

  const lastSlash = viewObject.key.lastIndexOf("/");
  const dir = lastSlash >= 0 ? viewObject.key.slice(0, lastSlash) : "";
  const key = `${dir}/edits/edit-${Date.now()}.splat`;

  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression:
        "SET pending_edit_key = :key, pending_edit_bucket = :bucket, updated_at = :now",
      ConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: {
        ":key": { S: key },
        ":bucket": { S: viewObject.bucket },
        ":now": { S: now },
        ":uid": { S: userId },
      },
    })
  );

  const putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: viewObject.bucket,
      Key: key,
      ContentType: EDIT_CONTENT_TYPE,
    }),
    { expiresIn: URL_TTL_S }
  );

  return response(200, { sceneId, key, putUrl, expiresIn: URL_TTL_S });
};
