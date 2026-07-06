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
    mentions: item.mention_usernames?.SS ?? [],
    createdAt: item.created_at?.S ?? "",
    // Threaded replies (one level deep — a reply cannot itself be replied
    // to, see createReply). Top-level comments carry replyCount; replies
    // carry parentCommentId. See dynamodb-comments.tf for the sparse GSI
    // that makes listReplies() efficient.
    parentCommentId: item.parent_comment_id?.S ?? null,
    replyCount: Number(item.reply_count?.N ?? 0),
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

async function createComment({ sceneId, userId, authorProfile, body, mentions }) {
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

  if (mentions?.usernames?.length > 0 && mentions?.userIds?.length > 0) {
    item.mention_usernames = { SS: mentions.usernames };
    item.mention_user_ids = { SS: mentions.userIds };
  }

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

/**
 * Replies are one level deep only — a reply can't itself be replied to.
 * This keeps the DynamoDB model (and the UI) simple: every comment is
 * either a top-level comment or a reply, never a deeper thread.
 */
async function createReply({ sceneId, parentCommentId, userId, authorProfile, body, mentions }) {
  const validatedBody = validateBody(body);

  const parent = await getComment(sceneId, parentCommentId);
  if (!parent) {
    const err = new Error("Comment not found");
    err.statusCode = 404;
    throw err;
  }
  if (parent.parent_comment_id?.S) {
    const err = new Error("Cannot reply to a reply");
    err.statusCode = 400;
    throw err;
  }

  const createdAt = new Date().toISOString();
  const commentId = `${createdAt}#${randomUUID()}`;

  const item = {
    scene_id: { S: sceneId },
    comment_id: { S: commentId },
    user_id: { S: userId },
    body: { S: validatedBody },
    created_at: { S: createdAt },
    parent_comment_id: { S: parentCommentId },
    ...authorFieldsFromProfile(authorProfile),
  };

  if (mentions?.usernames?.length > 0 && mentions?.userIds?.length > 0) {
    item.mention_usernames = { SS: mentions.usernames };
    item.mention_user_ids = { SS: mentions.userIds };
  }

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
            TableName: COMMENTS_TABLE,
            Key: {
              scene_id: { S: sceneId },
              comment_id: { S: parentCommentId },
            },
            UpdateExpression:
              "SET reply_count = if_not_exists(reply_count, :zero) + :one",
            ExpressionAttributeValues: {
              ":zero": { N: "0" },
              ":one": { N: "1" },
            },
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

  const parentCommentId = comment.parent_comment_id?.S ?? null;
  const replyCount = Number(comment.reply_count?.N ?? 0);

  // Deleting a top-level comment with existing replies would orphan them
  // (DynamoDB has no cascade delete). Block it rather than silently leaving
  // dangling replies or scanning-and-batch-deleting on every request.
  if (!parentCommentId && replyCount > 0) {
    const err = new Error(
      "Cannot delete a comment that has replies. Delete the replies first."
    );
    err.statusCode = 409;
    throw err;
  }

  const transactItems = [
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
  ];

  if (parentCommentId) {
    transactItems.push({
      Update: {
        TableName: COMMENTS_TABLE,
        Key: {
          scene_id: { S: sceneId },
          comment_id: { S: parentCommentId },
        },
        UpdateExpression:
          "SET reply_count = if_not_exists(reply_count, :zero) + :minusOne",
        ConditionExpression: "if_not_exists(reply_count, :zero) >= :one",
        ExpressionAttributeValues: {
          ":zero": { N: "0" },
          ":one": { N: "1" },
          ":minusOne": { N: "-1" },
        },
      },
    });
  }

  try {
    await dynamo.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
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
      // Replies live under their parent (see listReplies) and are excluded
      // from the top-level feed. Note: DynamoDB applies Limit before this
      // filter, so a page can legitimately return fewer than `limit` items
      // once a scene has replies — acceptable for a comments feed at this
      // scale; revisit with a dedicated sparse GSI if pagination gaps show up.
      FilterExpression: "attribute_not_exists(parent_comment_id)",
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

async function listReplies({ sceneId, parentCommentId, limit, exclusiveStartKey }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: COMMENTS_TABLE,
      IndexName: "parent_comment_id-index",
      KeyConditionExpression: "parent_comment_id = :parentCommentId",
      ExpressionAttributeValues: { ":parentCommentId": { S: parentCommentId } },
      // Oldest-first: replies read like a conversation, unlike the
      // newest-first top-level feed.
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const replies = await Promise.all(
    (result.Items ?? [])
      .filter((item) => item.scene_id?.S === sceneId)
      .map((item) => commentResponseFromItem(item))
  );

  return {
    replies,
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

module.exports = {
  validateBody,
  createComment,
  createReply,
  deleteComment,
  listComments,
  listReplies,
  getComment,
  commentResponseFromItem,
};
