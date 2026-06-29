"use strict";

const { randomUUID } = require("crypto");
const {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} = require("@aws-sdk/client-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { counterValue } = require("./profile");

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});
const COMMENTS_TABLE = process.env.COMMENTS_TABLE_NAME;
const SCENES_TABLE = process.env.SCENES_TABLE_NAME;
const URL_TTL_S = 3600;
const MAX_BODY_LENGTH = 1000;

function validateBody(raw) {
  if (typeof raw !== "string") {
    const err = new Error("body must be a non-empty string");
    err.statusCode = 400;
    throw err;
  }
  const body = raw.trim();
  if (body === "") {
    const err = new Error("body must be a non-empty string");
    err.statusCode = 400;
    throw err;
  }
  if (body.length > MAX_BODY_LENGTH) {
    const err = new Error(`body must be at most ${MAX_BODY_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }
  return body;
}

function authorFieldsFromProfile(profileItem) {
  const fields = {
    author_username: { S: profileItem.username?.S ?? "" },
    author_display_name: { S: profileItem.display_name?.S ?? "" },
  };

  if (profileItem.avatar_key?.S) {
    fields.author_avatar_key = { S: profileItem.avatar_key.S };
  }
  if (profileItem.avatar_bucket?.S) {
    fields.author_avatar_bucket = { S: profileItem.avatar_bucket.S };
  }

  return fields;
}

function isTransactionCanceledForCondition(err, transactItemIndex) {
  if (err.name !== "TransactionCanceledException") return false;
  const reason = err.CancellationReasons?.[transactItemIndex];
  return reason?.Code === "ConditionalCheckFailed";
}

async function presignedAuthorAvatarUrl(item) {
  const key = item.author_avatar_key?.S;
  const bucket = item.author_avatar_bucket?.S;
  if (!key || !bucket) return null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

async function commentResponseFromItem(item) {
  const authorAvatarUrl = await presignedAuthorAvatarUrl(item);
  return {
    commentId: item.comment_id?.S ?? "",
    sceneId: item.scene_id?.S ?? "",
    userId: item.user_id?.S ?? "",
    authorUsername: item.author_username?.S ?? "",
    authorDisplayName: item.author_display_name?.S ?? "",
    authorAvatarUrl,
    body: item.body?.S ?? "",
    createdAt: item.created_at?.S ?? "",
  };
}

async function getComment(sceneId, commentId) {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: COMMENTS_TABLE,
      Key: {
        scene_id: { S: sceneId },
        comment_id: { S: commentId },
      },
    })
  );
  return result.Item ?? null;
}

async function createComment({ sceneId, userId, authorProfile, body }) {
  const validatedBody = validateBody(body);
  const createdAt = new Date().toISOString();
  const commentId = `${createdAt}#${randomUUID()}`;

  const item = {
    scene_id: { S: sceneId },
    comment_id: { S: commentId },
    user_id: { S: userId },
    body: { S: validatedBody },
    created_at: { S: createdAt },
    ...authorFieldsFromProfile(authorProfile),
  };

  await dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: COMMENTS_TABLE,
            Item: item,
          },
        },
        {
          Update: {
            TableName: SCENES_TABLE,
            Key: { scene_id: { S: sceneId } },
            UpdateExpression:
              "SET comments_count = if_not_exists(comments_count, :zero) + :one",
            ExpressionAttributeValues: {
              ":zero": { N: "0" },
              ":one": { N: "1" },
            },
          },
        },
      ],
    })
  );

  return await commentResponseFromItem(item);
}

async function deleteComment({ sceneId, commentId, scene, callerId }) {
  const comment = await getComment(sceneId, commentId);
  if (!comment) {
    const err = new Error("Comment not found");
    err.statusCode = 404;
    throw err;
  }

  const commentAuthorId = comment.user_id?.S;
  const sceneOwnerId = scene.user_id?.S;
  const isAuthor = commentAuthorId === callerId;
  const isSceneOwner = sceneOwnerId === callerId;

  if (!isAuthor && !isSceneOwner) {
    const err = new Error("Forbidden: cannot delete this comment");
    err.statusCode = 403;
    throw err;
  }

  try {
    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Delete: {
              TableName: COMMENTS_TABLE,
              Key: {
                scene_id: { S: sceneId },
                comment_id: { S: commentId },
              },
              ConditionExpression: "attribute_exists(comment_id)",
            },
          },
          {
            Update: {
              TableName: SCENES_TABLE,
              Key: { scene_id: { S: sceneId } },
              UpdateExpression:
                "SET comments_count = if_not_exists(comments_count, :zero) + :minusOne",
              ConditionExpression: "if_not_exists(comments_count, :zero) >= :one",
              ExpressionAttributeValues: {
                ":zero": { N: "0" },
                ":one": { N: "1" },
                ":minusOne": { N: "-1" },
              },
            },
          },
        ],
      })
    );
  } catch (err) {
    if (isTransactionCanceledForCondition(err, 0)) {
      const notFound = new Error("Comment not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw err;
  }

  const sceneResult = await dynamo.send(
    new GetItemCommand({
      TableName: SCENES_TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  return {
    ok: true,
    commentsCount: counterValue(sceneResult.Item, "comments_count"),
  };
}

async function listComments({ sceneId, limit, exclusiveStartKey }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: COMMENTS_TABLE,
      KeyConditionExpression: "scene_id = :sceneId",
      ExpressionAttributeValues: { ":sceneId": { S: sceneId } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const comments = await Promise.all(
    (result.Items ?? []).map((item) => commentResponseFromItem(item))
  );

  return {
    comments,
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

module.exports = {
  validateBody,
  createComment,
  deleteComment,
  listComments,
  commentResponseFromItem,
};
