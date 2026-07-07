"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { ALLOWED_REACTIONS } = require("../lib/reaction-types");
const { setCommentReaction } = require("../lib/comment-reactions");
const { getComment } = require("../lib/comments");
const { sceneVisibilityFromItem } = require("../lib/scene-response");
const { getOwnerProfile } = require("../lib/scene-owner");
const { emitNotification } = require("../lib/notifications");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * PUT /api/v1/scenes/{sceneId}/comments/{commentId}/reaction
 *
 * Set or change the caller's reaction on a comment.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const commentId = event.pathParameters?.commentId;
  if (!commentId || typeof commentId !== "string" || commentId.trim() === "") {
    return response(400, { error: "Missing path parameter: commentId" });
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

  const sceneResult = await dynamo.send(
    new GetItemCommand({
      TableName: SCENES_TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const scene = sceneResult.Item;
  if (!scene) return response(404, { error: "Scene not found" });

  const isOwner = scene.user_id?.S === userId;
  const isPublic = sceneVisibilityFromItem(scene) === "PUBLIC";
  if (!isOwner && !isPublic) {
    return response(403, { error: "Forbidden: scene is not visible to this user" });
  }

  const comment = await getComment(sceneId, commentId);
  if (!comment) return response(404, { error: "Comment not found" });

  let summary;
  try {
    summary = await setCommentReaction({ sceneId, commentId, userId, type });
  } catch (err) {
    if (err.statusCode) return response(err.statusCode, { error: err.message });
    throw err;
  }

  if (summary.added) {
    const commentAuthorId = comment.user_id?.S;
    if (commentAuthorId && commentAuthorId !== userId) {
      const actorProfile = await getOwnerProfile(userId);
      if (actorProfile) {
        await emitNotification({
          recipientId: commentAuthorId,
          actorProfile,
          type: "REACTION",
          sceneId,
          commentId,
          reactionType: type,
        });
      }
    }
  }

  const { added: _added, ...reactionBody } = summary;
  return response(200, reactionBody);
};
