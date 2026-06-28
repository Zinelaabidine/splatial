"use strict";

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  resolveSceneViewObject,
  thumbnailKeyForViewKey,
} = require("../lib/scene-view-key");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;
const THUMBNAIL_CONTENT_TYPE = "image/jpeg";

/**
 * POST /api/v1/scenes/{sceneId}/thumbnail/presign
 *
 * Returns a presigned PUT URL for uploading a JPEG thumbnail next to the
 * scene's splat artifact. After upload, call PATCH /api/v1/scenes/{sceneId}
 * with { thumbnailKey } to persist the reference in DynamoDB.
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

  const key = thumbnailKeyForViewKey(viewObject.key);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: viewObject.bucket,
      Key: key,
      ContentType: THUMBNAIL_CONTENT_TYPE,
    }),
    { expiresIn: URL_TTL_S }
  );

  return response(200, {
    sceneId,
    key,
    uploadUrl,
    contentType: THUMBNAIL_CONTENT_TYPE,
    expiresIn: URL_TTL_S,
  });
};
