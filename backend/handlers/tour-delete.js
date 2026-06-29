"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { deleteTour } = require("../lib/tours");
const { sceneVisibilityFromItem } = require("../lib/scene-response");

const dynamo = new DynamoDBClient({});
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;

/**
 * DELETE /api/v1/scenes/{sceneId}/tours/{tourId}
 *
 * Delete a tour. Allowed for the tour creator or scene owner.
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing path parameter: sceneId" });
  }

  const tourId = event.pathParameters?.tourId;
  if (!tourId || typeof tourId !== "string" || tourId.trim() === "") {
    return response(400, { error: "Missing path parameter: tourId" });
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

  try {
    const payload = await deleteTour({
      sceneId,
      tourId,
      scene: item,
      callerId: userId,
    });
    return response(200, payload);
  } catch (err) {
    if (err.statusCode) {
      return response(err.statusCode, { error: err.message });
    }
    throw err;
  }
};
