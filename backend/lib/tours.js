"use strict";

const { randomUUID } = require("crypto");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { validateViewMatrix } = require("./shots");

const dynamo = new DynamoDBClient({});
const TOURS_TABLE = process.env.TOURS_TABLE_NAME;

const MIN_ITEMS = 2;
const MAX_ITEMS = 20;
const MAX_TITLE_LENGTH = 80;
const MAX_ITEM_LABEL_LENGTH = 60;
const DEFAULT_SEGMENT_DURATION_MS = 3000;
const MIN_SEGMENT_DURATION_MS = 500;
const MAX_SEGMENT_DURATION_MS = 15000;

function validateItemLabel(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, label: "" };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "item label must be a string" };
  }
  const label = value.trim();
  if (label.length > MAX_ITEM_LABEL_LENGTH) {
    return {
      ok: false,
      error: `item label must be at most ${MAX_ITEM_LABEL_LENGTH} characters`,
    };
  }
  return { ok: true, label };
}

function validateTourInput({ title, items, segmentDurationMs }) {
  if (typeof title !== "string" || title.trim() === "") {
    return { ok: false, error: "title must be a non-empty string" };
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    return {
      ok: false,
      error: `title must be at most ${MAX_TITLE_LENGTH} characters`,
    };
  }

  if (!Array.isArray(items)) {
    return { ok: false, error: "items must be an array" };
  }
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) {
    return {
      ok: false,
      error: `items must contain between ${MIN_ITEMS} and ${MAX_ITEMS} viewpoints`,
    };
  }

  const normalizedItems = [];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `items[${i}] must be an object` };
    }

    const matrixResult = validateViewMatrix(raw.matrix);
    if (!matrixResult.ok) {
      return { ok: false, error: `items[${i}].${matrixResult.error.replace("viewMatrix", "matrix")}` };
    }

    const labelResult = validateItemLabel(raw.label);
    if (!labelResult.ok) {
      return { ok: false, error: `items[${i}].${labelResult.error}` };
    }

    normalizedItems.push({
      matrix: matrixResult.viewMatrix,
      label: labelResult.label,
    });
  }

  let duration = DEFAULT_SEGMENT_DURATION_MS;
  if (segmentDurationMs !== undefined && segmentDurationMs !== null) {
    if (!Number.isInteger(segmentDurationMs)) {
      return {
        ok: false,
        error: "segmentDurationMs must be an integer",
      };
    }
    if (
      segmentDurationMs < MIN_SEGMENT_DURATION_MS ||
      segmentDurationMs > MAX_SEGMENT_DURATION_MS
    ) {
      return {
        ok: false,
        error: `segmentDurationMs must be between ${MIN_SEGMENT_DURATION_MS} and ${MAX_SEGMENT_DURATION_MS}`,
      };
    }
    duration = segmentDurationMs;
  }

  return {
    ok: true,
    title: trimmedTitle,
    items: normalizedItems,
    segmentDurationMs: duration,
  };
}

function matrixToDynamo(matrix) {
  return {
    L: matrix.map((n) => ({ N: String(n) })),
  };
}

function matrixFromDynamo(item) {
  return (item?.L ?? []).map((x) => Number(x.N));
}

function itemsToDynamo(items) {
  return {
    L: items.map((entry) => {
      const map = {
        matrix: matrixToDynamo(entry.matrix),
      };
      if (entry.label !== "") {
        map.label = { S: entry.label };
      }
      return { M: map };
    }),
  };
}

function itemsFromItem(item) {
  return (item.items?.L ?? []).map((entry) => {
    const map = entry.M ?? {};
    const label = map.label?.S ?? "";
    return {
      matrix: matrixFromDynamo(map.matrix),
      ...(label !== "" ? { label } : {}),
    };
  });
}

function tourResponseFromItem(item) {
  const response = {
    tourId: item.tour_id?.S ?? "",
    sceneId: item.scene_id?.S ?? "",
    creatorUsername: item.creator_username?.S ?? "",
    title: item.title?.S ?? "",
    segmentDurationMs: Number(item.segment_duration_ms?.N ?? DEFAULT_SEGMENT_DURATION_MS),
    items: itemsFromItem(item),
    createdAt: item.created_at?.S ?? "",
  };
  return response;
}

async function getTour(sceneId, tourId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TOURS_TABLE,
      Key: {
        scene_id: { S: sceneId },
        tour_id: { S: tourId },
      },
    })
  );
  return result.Item ?? null;
}

async function createTour({
  sceneId,
  userId,
  creatorProfile,
  title,
  items,
  segmentDurationMs,
}) {
  const createdAt = new Date().toISOString();
  const tourId = `${createdAt}#${randomUUID()}`;

  const item = {
    scene_id: { S: sceneId },
    tour_id: { S: tourId },
    creator_user_id: { S: userId },
    creator_username: { S: creatorProfile.username?.S ?? "" },
    title: { S: title },
    segment_duration_ms: { N: String(segmentDurationMs) },
    items: itemsToDynamo(items),
    created_at: { S: createdAt },
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: TOURS_TABLE,
      Item: item,
    })
  );

  return tourResponseFromItem(item);
}

async function listTours({ sceneId, limit, exclusiveStartKey }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TOURS_TABLE,
      KeyConditionExpression: "scene_id = :sceneId",
      ExpressionAttributeValues: { ":sceneId": { S: sceneId } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  return {
    tours: (result.Items ?? []).map((entry) => tourResponseFromItem(entry)),
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

async function deleteTour({ sceneId, tourId, scene, callerId }) {
  const tour = await getTour(sceneId, tourId);
  if (!tour) {
    const err = new Error("Tour not found");
    err.statusCode = 404;
    throw err;
  }

  const tourCreatorId = tour.creator_user_id?.S;
  const sceneOwnerId = scene.user_id?.S;
  const isCreator = tourCreatorId === callerId;
  const isSceneOwner = sceneOwnerId === callerId;

  if (!isCreator && !isSceneOwner) {
    const err = new Error("Forbidden: cannot delete this tour");
    err.statusCode = 403;
    throw err;
  }

  try {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: TOURS_TABLE,
        Key: {
          scene_id: { S: sceneId },
          tour_id: { S: tourId },
        },
        ConditionExpression: "attribute_exists(tour_id)",
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      const notFound = new Error("Tour not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw err;
  }

  return { ok: true };
}

module.exports = {
  validateTourInput,
  tourResponseFromItem,
  getTour,
  createTour,
  listTours,
  deleteTour,
};
