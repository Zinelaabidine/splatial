"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { sceneVisibilityFromItem } = require("../lib/scene-response");
const { resolveSceneViewObject } = require("../lib/scene-view-key");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;

/**
 * GET /api/v1/scenes/{sceneId}/view-url
 *
 * Generates a presigned S3 GET URL for the scene's .splat or .ply file, valid for 1 hour.
 * The browser-side Gaussian Splat viewer fetches the asset directly from S3.
 *
 * Success response (200):
 *   { "sceneId": "...", "url": "https://s3.amazonaws.com/...", "expiresIn": 3600 }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId) return response(400, { error: "Missing path parameter: sceneId" });

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  const isOwner = item.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(item) === "PUBLIC";
  if (!isOwner && !isPublic) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  if (item.status?.S !== "READY") {
    return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
  }

  const viewObject = await resolveSceneViewObject(item, SPLAT_BUCKET);
  if (!viewObject) {
    return response(409, { error: "Scene has no viewable splat file associated" });
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: viewObject.bucket, Key: viewObject.key }),
    { expiresIn: URL_TTL_S }
  );

  return response(200, { sceneId, url, expiresIn: URL_TTL_S });
};
