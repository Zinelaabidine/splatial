"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { removeCommentReaction } = require("../lib/comment-reactions");
const { getComment } = require("../lib/comments");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * DELETE /api/v1/scenes/{sceneId}/comments/{commentId}/reaction
 *
 * Remove the caller's reaction from a comment.
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

  const summary = await removeCommentReaction({ sceneId, commentId, userId });
  return response(200, summary);
};
