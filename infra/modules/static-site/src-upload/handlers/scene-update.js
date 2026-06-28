"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { mapProgressFromItem } = require("../lib/progress-fields");
const {
  resolveSceneViewObject,
  thumbnailKeyForViewKey,
} = require("../lib/scene-view-key");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;

async function presignedThumbnailUrl(bucket, key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

function sceneResponseFromItem(item, thumbnailUrl) {
  return {
    sceneId: item.scene_id?.S ?? "",
    name: item.name?.S ?? "",
    inputType: item.input_type?.S ?? "",
    status: item.status?.S ?? "",
    createdAt: item.created_at?.S ?? "",
    ...(item.ply_key ? { plyKey: item.ply_key.S } : {}),
    ...(item.thumbnail_key ? { thumbnailKey: item.thumbnail_key.S } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...mapProgressFromItem(item),
  };
}

/**
 * PATCH /api/v1/scenes/{sceneId}
 *
 * Updates scene metadata owned by the caller.
 *
 * Request body (at least one field required):
 *   { "name"?: string, "thumbnailKey"?: string }
 *
 * thumbnailKey must match the key returned by POST .../thumbnail/presign
 * after the client uploads the JPEG to S3.
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

  const { name, thumbnailKey } = body;
  const hasName = name !== undefined;
  const hasThumbnailKey = thumbnailKey !== undefined;

  if (!hasName && !hasThumbnailKey) {
    return response(400, { error: "Provide at least one of: name, thumbnailKey" });
  }

  if (hasName && (typeof name !== "string" || name.trim() === "")) {
    return response(400, { error: "name must be a non-empty string" });
  }

  if (hasThumbnailKey && (typeof thumbnailKey !== "string" || thumbnailKey.trim() === "")) {
    return response(400, { error: "thumbnailKey must be a non-empty string" });
  }

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

  if (hasThumbnailKey) {
    if (item.status?.S !== "READY") {
      return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
    }

    const viewObject = await resolveSceneViewObject(item, SPLAT_BUCKET);
    if (!viewObject) {
      return response(409, { error: "Scene has no viewable splat file associated" });
    }

    const expectedKey = thumbnailKeyForViewKey(viewObject.key);
    if (thumbnailKey !== expectedKey) {
      return response(400, { error: "thumbnailKey does not match the scene output directory" });
    }
  }

  const now = new Date().toISOString();
  const exprParts = ["updated_at = :now"];
  const exprValues = { ":now": { S: now }, ":uid": { S: userId } };
  const exprNames = {};

  if (hasName) {
    exprParts.push("#nm = :name");
    exprNames["#nm"] = "name";
    exprValues[":name"] = { S: name.trim() };
  }

  if (hasThumbnailKey) {
    exprParts.push("thumbnail_key = :thumbKey");
    exprParts.push("thumbnail_bucket = :thumbBucket");
    const viewObject = await resolveSceneViewObject(item, SPLAT_BUCKET);
    exprValues[":thumbKey"] = { S: thumbnailKey };
    exprValues[":thumbBucket"] = { S: viewObject.bucket };
  }

  const updateResult = await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression: `SET ${exprParts.join(", ")}`,
      ConditionExpression: "user_id = :uid",
      ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
      ExpressionAttributeValues: exprValues,
      ReturnValues: "ALL_NEW",
    })
  );

  const updated = updateResult.Attributes ?? item;
  let thumbnailUrl;
  const storedKey = updated.thumbnail_key?.S;
  const storedBucket = updated.thumbnail_bucket?.S ?? SPLAT_BUCKET;
  if (storedKey) {
    thumbnailUrl = await presignedThumbnailUrl(storedBucket, storedKey);
  }

  return response(200, sceneResponseFromItem(updated, thumbnailUrl));
};
