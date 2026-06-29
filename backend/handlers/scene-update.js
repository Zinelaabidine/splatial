"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const {
  adjustPublicScenesCount,
  buildOwnerRefreshUpdate,
  getOwnerProfile,
} = require("../lib/scene-owner");
const {
  ALLOWED_VISIBILITY,
  sceneResponseFromItem,
  sceneVisibilityFromItem,
} = require("../lib/scene-response");
const {
  resolveSceneViewObject,
  thumbnailKeyForViewKey,
} = require("../lib/scene-view-key");
const { normalizeTags, validateCategory } = require("../lib/scene-taxonomy");

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

/**
 * PATCH /api/v1/scenes/{sceneId}
 *
 * Updates scene metadata owned by the caller.
 *
 * Request body (at least one field required):
 *   { "name"?: string, "thumbnailKey"?: string, "visibility"?: "PUBLIC" | "PRIVATE", "category"?: string | null, "tags"?: string[] }
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

  const { name, thumbnailKey, visibility, category, tags } = body;
  const hasName = name !== undefined;
  const hasThumbnailKey = thumbnailKey !== undefined;
  const hasVisibility = visibility !== undefined;
  const hasCategory = category !== undefined;
  const hasTags = tags !== undefined;

  if (!hasName && !hasThumbnailKey && !hasVisibility && !hasCategory && !hasTags) {
    return response(400, {
      error: "Provide at least one of: name, thumbnailKey, visibility, category, tags",
    });
  }

  if (hasName && (typeof name !== "string" || name.trim() === "")) {
    return response(400, { error: "name must be a non-empty string" });
  }

  if (hasThumbnailKey && (typeof thumbnailKey !== "string" || thumbnailKey.trim() === "")) {
    return response(400, { error: "thumbnailKey must be a non-empty string" });
  }

  if (hasVisibility && !ALLOWED_VISIBILITY.has(visibility)) {
    return response(400, { error: "visibility must be 'PUBLIC' or 'PRIVATE'" });
  }

  let validatedCategory;
  let clearCategory = false;
  if (hasCategory) {
    if (category === null || category === "") {
      clearCategory = true;
    } else {
      const categoryResult = validateCategory(category);
      if (!categoryResult.ok) {
        return response(400, { error: categoryResult.error });
      }
      validatedCategory = categoryResult.category;
    }
  }

  let normalizedTags;
  let clearTags = false;
  if (hasTags) {
    const tagsResult = normalizeTags(tags);
    if (!tagsResult.ok) {
      return response(400, { error: tagsResult.error });
    }
    if (tagsResult.tags.length === 0) {
      clearTags = true;
    } else {
      normalizedTags = tagsResult.tags;
    }
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

  let resolvedViewObject = null;
  if (hasThumbnailKey) {
    if (item.status?.S !== "READY") {
      return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
    }

    resolvedViewObject = await resolveSceneViewObject(item, SPLAT_BUCKET);
    if (!resolvedViewObject) {
      return response(409, { error: "Scene has no viewable splat file associated" });
    }

    const expectedKey = thumbnailKeyForViewKey(resolvedViewObject.key);
    if (thumbnailKey !== expectedKey) {
      return response(400, { error: "thumbnailKey does not match the scene output directory" });
    }
  }

  const currentVisibility = sceneVisibilityFromItem(item);
  const visibilityChanging = hasVisibility && visibility !== currentVisibility;

  let ownerRefresh = null;
  if (visibilityChanging) {
    const profile = await getOwnerProfile(userId);
    if (!profile?.username?.S) {
      return response(400, { error: "Complete profile setup before changing scene visibility" });
    }
    ownerRefresh = buildOwnerRefreshUpdate(profile, userId);
  }

  const now = new Date().toISOString();
  const exprParts = ["updated_at = :now"];
  const exprValues = { ":now": { S: now }, ":uid": { S: userId } };
  const exprNames = {};
  const removeParts = [];

  if (hasName) {
    exprParts.push("#nm = :name");
    exprNames["#nm"] = "name";
    exprValues[":name"] = { S: name.trim() };
  }

  if (hasThumbnailKey) {
    exprParts.push("thumbnail_key = :thumbKey");
    exprParts.push("thumbnail_bucket = :thumbBucket");
    exprValues[":thumbKey"] = { S: thumbnailKey };
    exprValues[":thumbBucket"] = { S: resolvedViewObject.bucket };
  }

  if (hasVisibility) {
    exprParts.push("visibility = :visibility");
    exprValues[":visibility"] = { S: visibility };
  }

  if (hasCategory) {
    if (clearCategory) {
      removeParts.push("category");
    } else {
      exprParts.push("category = :category");
      exprValues[":category"] = { S: validatedCategory };
    }
  }

  if (hasTags) {
    if (clearTags) {
      removeParts.push("tags");
    } else {
      exprParts.push("tags = :tags");
      exprValues[":tags"] = { SS: normalizedTags };
    }
  }

  if (ownerRefresh) {
    exprParts.push(...ownerRefresh.setParts);
    removeParts.push(...ownerRefresh.removeParts);
    Object.assign(exprValues, ownerRefresh.values);
  }

  if (visibilityChanging) {
    if (visibility === "PUBLIC") {
      exprParts.push("public_owner_id = :pubOwner");
      exprValues[":pubOwner"] = { S: userId };
    } else {
      removeParts.push("public_owner_id");
    }
  }

  let updateExpression = `SET ${exprParts.join(", ")}`;
  if (removeParts.length > 0) {
    updateExpression += ` REMOVE ${removeParts.join(", ")}`;
  }

  const updateResult = await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression: updateExpression,
      ConditionExpression: "user_id = :uid",
      ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
      ExpressionAttributeValues: exprValues,
      ReturnValues: "ALL_NEW",
    })
  );

  if (visibilityChanging) {
    if (visibility === "PUBLIC") {
      await adjustPublicScenesCount(userId, 1);
    } else {
      await adjustPublicScenesCount(userId, -1);
    }
  }

  const updated = updateResult.Attributes ?? item;
  let thumbnailUrl;
  const storedKey = updated.thumbnail_key?.S;
  const storedBucket = updated.thumbnail_bucket?.S ?? SPLAT_BUCKET;
  if (storedKey) {
    thumbnailUrl = await presignedThumbnailUrl(storedBucket, storedKey);
  }

  return response(200, sceneResponseFromItem(updated, thumbnailUrl));
};
