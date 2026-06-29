"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { ALLOWED_REACTIONS } = require("../lib/reaction-types");
const { setReaction } = require("../lib/reactions");
const { sceneVisibilityFromItem } = require("../lib/scene-response");
const { getOwnerProfile } = require("../lib/scene-owner");
const { emitNotification } = require("../lib/notifications");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * PUT /api/v1/scenes/{sceneId}/reaction
 *
 * Set or change the caller's reaction on a scene.
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

  const type = body.type;
  if (typeof type !== "string" || type.trim() === "" || !ALLOWED_REACTIONS.has(type)) {
    return response(400, { error: "Invalid reaction type" });
  }

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: SCENES_TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  const isOwner = item.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(item) === "PUBLIC";
  if (!isOwner && !isPublic) {
    return response(403, { error: "Forbidden: scene is not visible to this user" });
  }

  const summary = await setReaction(sceneId, userId, type);

  if (summary.added) {
    const sceneOwnerId = item.user_id?.S;
    if (sceneOwnerId && sceneOwnerId !== userId) {
      const actorProfile = await getOwnerProfile(userId);
      if (actorProfile) {
        await emitNotification({
          recipientId: sceneOwnerId,
          actorProfile,
          type: "REACTION",
          sceneId,
          reactionType: type,
        });
      }
    }
  }

  const { added: _added, ...reactionBody } = summary;
  return response(200, reactionBody);
};
