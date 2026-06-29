"use strict";

const {
  S3Client,
  CopyObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");
const response = require("../lib/response");
const {
  DEFAULT_VISIBILITY,
  sceneResponseFromItem,
  sceneVisibilityFromItem,
} = require("../lib/scene-response");
const { getOwnerProfile, ownerFieldsFromProfile } = require("../lib/scene-owner");
const {
  resolveSceneViewObject,
  thumbnailKeyForViewKey,
  THUMBNAIL_FILENAME,
} = require("../lib/scene-view-key");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;

async function objectExists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function presignedThumbnailUrl(bucket, key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

async function incrementSourceForksCount(sourceSceneId) {
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { scene_id: { S: sourceSceneId } },
        UpdateExpression:
          "SET forks_count = if_not_exists(forks_count, :zero) + :one, updated_at = :now",
        ExpressionAttributeValues: {
          ":zero": { N: "0" },
          ":one": { N: "1" },
          ":now": { S: new Date().toISOString() },
        },
      })
    );
  } catch (err) {
    console.error("fork-create forks_count increment failed", {
      sourceSceneId,
      message: err.message,
    });
  }
}

function fileExtension(key) {
  const dot = key.lastIndexOf(".");
  if (dot < 0) return "";
  return key.slice(dot);
}

/**
 * POST /api/v1/scenes/{sceneId}/fork
 *
 * Server-side copies a READY scene's viewable artifact into the forker's space
 * and creates a new PRIVATE scene record with lineage to the source.
 *
 * Request body (optional):
 *   { "name"?: string }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const { name } = body;
  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    return response(400, { error: "name must be a non-empty string when provided" });
  }

  const sourceResult = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const source = sourceResult.Item;
  if (!source) return response(404, { error: "Scene not found" });

  const isOwner = source.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(source) === "PUBLIC";
  if (!isOwner && !isPublic) {
    return response(403, { error: "Forbidden: scene is not visible to this user" });
  }

  if (source.status?.S !== "READY") {
    return response(409, {
      error: "Scene is not ready to fork",
      status: source.status?.S ?? "UNKNOWN",
    });
  }

  const viewObject = await resolveSceneViewObject(source, SPLAT_BUCKET);
  if (!viewObject) {
    return response(409, { error: "Scene has no viewable splat file associated" });
  }

  const profile = await getOwnerProfile(userId);
  if (!profile?.username?.S) {
    return response(400, { error: "Complete profile setup before forking scenes" });
  }

  const sourceName = source.name?.S ?? "Untitled";
  const newSceneId = randomUUID();
  const now = new Date().toISOString();
  const destPrefix = `forks/${userId}/${newSceneId}/`;
  const ext = fileExtension(viewObject.key);
  const destSplatKey = `${destPrefix}scene${ext}`;

  // Single-part CopyObject supports objects up to 5 GB; multipart copy is the
  // future upgrade for larger artifacts.
  await s3.send(
    new CopyObjectCommand({
      Bucket: SPLAT_BUCKET,
      Key: destSplatKey,
      CopySource: `${viewObject.bucket}/${viewObject.key}`,
    })
  );

  const sourceThumbnailKey = thumbnailKeyForViewKey(viewObject.key);
  let destThumbnailKey;
  if (await objectExists(viewObject.bucket, sourceThumbnailKey)) {
    destThumbnailKey = `${destPrefix}${THUMBNAIL_FILENAME}`;
    await s3.send(
      new CopyObjectCommand({
        Bucket: SPLAT_BUCKET,
        Key: destThumbnailKey,
        CopySource: `${viewObject.bucket}/${sourceThumbnailKey}`,
      })
    );
  }

  const forkName =
    name !== undefined ? name.trim() : `Fork of ${sourceName}`;
  const ownerFields = ownerFieldsFromProfile(profile, userId);
  const sourceOwnerUsername = source.owner_username?.S ?? "";

  const newItem = {
    scene_id: { S: newSceneId },
    user_id: { S: userId },
    name: { S: forkName },
    input_type: { S: source.input_type?.S ?? "video" },
    status: { S: "READY" },
    visibility: { S: DEFAULT_VISIBILITY },
    ply_key: { S: destSplatKey },
    output_bucket: { S: SPLAT_BUCKET },
    created_at: { S: now },
    updated_at: { S: now },
    forked_from_scene_id: { S: sceneId },
    forked_from_username: { S: sourceOwnerUsername },
    ...ownerFields,
    ...(destThumbnailKey
      ? {
          thumbnail_key: { S: destThumbnailKey },
          thumbnail_bucket: { S: SPLAT_BUCKET },
        }
      : {}),
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: newItem,
      ConditionExpression: "attribute_not_exists(scene_id)",
    })
  );

  await incrementSourceForksCount(sceneId);

  let thumbnailUrl;
  if (destThumbnailKey) {
    thumbnailUrl = await presignedThumbnailUrl(SPLAT_BUCKET, destThumbnailKey);
  }

  return response(200, sceneResponseFromItem(newItem, thumbnailUrl));
};
