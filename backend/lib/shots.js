"use strict";

const { randomUUID } = require("crypto");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");

const dynamo = new DynamoDBClient({});
const SHOTS_TABLE = process.env.SHOTS_TABLE_NAME;

const DEFAULT_LABEL = "Shot";
const MAX_LABEL_LENGTH = 80;

function validateViewMatrix(value) {
  if (!Array.isArray(value)) {
    return { ok: false, error: "viewMatrix must be an array of 16 numbers" };
  }
  if (value.length !== 16) {
    return { ok: false, error: "viewMatrix must contain exactly 16 numbers" };
  }
  for (const n of value) {
    if (!Number.isFinite(n)) {
      return { ok: false, error: "viewMatrix must contain only finite numbers" };
    }
  }
  return { ok: true, viewMatrix: value };
}

function validateLabel(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, label: DEFAULT_LABEL };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "label must be a string" };
  }
  const label = value.trim();
  if (label === "") {
    return { ok: true, label: DEFAULT_LABEL };
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return {
      ok: false,
      error: `label must be at most ${MAX_LABEL_LENGTH} characters`,
    };
  }
  return { ok: true, label };
}

function viewMatrixToDynamo(viewMatrix) {
  return {
    L: viewMatrix.map((n) => ({ N: String(n) })),
  };
}

function viewMatrixFromItem(item) {
  return (item.view_matrix?.L ?? []).map((x) => Number(x.N));
}

function shotResponseFromItem(item) {
  return {
    shotId: item.shot_id?.S ?? "",
    sceneId: item.scene_id?.S ?? "",
    creatorUsername: item.creator_username?.S ?? "",
    label: item.label?.S ?? DEFAULT_LABEL,
    viewMatrix: viewMatrixFromItem(item),
    createdAt: item.created_at?.S ?? "",
  };
}

async function getShot(sceneId, shotId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: SHOTS_TABLE,
      Key: {
        scene_id: { S: sceneId },
        shot_id: { S: shotId },
      },
    })
  );
  return result.Item ?? null;
}

async function createShot({ sceneId, userId, creatorProfile, viewMatrix, label }) {
  const createdAt = new Date().toISOString();
  const shotId = `${createdAt}#${randomUUID()}`;

  const item = {
    scene_id: { S: sceneId },
    shot_id: { S: shotId },
    creator_user_id: { S: userId },
    creator_username: { S: creatorProfile.username?.S ?? "" },
    label: { S: label },
    view_matrix: viewMatrixToDynamo(viewMatrix),
    created_at: { S: createdAt },
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: SHOTS_TABLE,
      Item: item,
    })
  );

  return shotResponseFromItem(item);
}

async function listShots({ sceneId, limit, exclusiveStartKey }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: SHOTS_TABLE,
      KeyConditionExpression: "scene_id = :sceneId",
      ExpressionAttributeValues: { ":sceneId": { S: sceneId } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  return {
    shots: (result.Items ?? []).map((item) => shotResponseFromItem(item)),
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

async function deleteShot({ sceneId, shotId, scene, callerId }) {
  const shot = await getShot(sceneId, shotId);
  if (!shot) {
    const err = new Error("Shot not found");
    err.statusCode = 404;
    throw err;
  }

  const shotCreatorId = shot.creator_user_id?.S;
  const sceneOwnerId = scene.user_id?.S;
  const isCreator = shotCreatorId === callerId;
  const isSceneOwner = sceneOwnerId === callerId;

  if (!isCreator && !isSceneOwner) {
    const err = new Error("Forbidden: cannot delete this shot");
    err.statusCode = 403;
    throw err;
  }

  try {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: SHOTS_TABLE,
        Key: {
          scene_id: { S: sceneId },
          shot_id: { S: shotId },
        },
        ConditionExpression: "attribute_exists(shot_id)",
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      const notFound = new Error("Shot not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw err;
  }

  return { ok: true };
}

module.exports = {
  validateViewMatrix,
  validateLabel,
  shotResponseFromItem,
  getShot,
  createShot,
  listShots,
  deleteShot,
};
