"use strict";

const { randomUUID } = require("crypto");
const {
  DynamoDBClient,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { counterValue } = require("./profile");

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME;
const PROFILES_TABLE = process.env.PROFILES_TABLE_NAME;
const URL_TTL_S = 3600;

const ALLOWED_TYPES = new Set(["FOLLOW", "REACTION", "COMMENT", "MENTION"]);

function actorFieldsFromProfile(profileItem) {
  const fields = {
    actor_user_id: { S: profileItem.user_id?.S ?? "" },
    actor_username: { S: profileItem.username?.S ?? "" },
    actor_display_name: { S: profileItem.display_name?.S ?? "" },
  };

  if (profileItem.avatar_key?.S) {
    fields.actor_avatar_key = { S: profileItem.avatar_key.S };
  }
  if (profileItem.avatar_bucket?.S) {
    fields.actor_avatar_bucket = { S: profileItem.avatar_bucket.S };
  }

  return fields;
}

async function presignedActorAvatarUrl(item) {
  const key = item.actor_avatar_key?.S;
  const bucket = item.actor_avatar_bucket?.S;
  if (!key || !bucket) return null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

async function notificationFromItem(item, lastReadAt) {
  const createdAt = item.created_at?.S ?? "";
  const actorAvatarUrl = await presignedActorAvatarUrl(item);

  const notification = {
    notificationId: item.notification_id?.S ?? "",
    type: item.type?.S ?? "",
    actorUsername: item.actor_username?.S ?? "",
    actorDisplayName: item.actor_display_name?.S ?? "",
    actorAvatarUrl,
    createdAt,
    read: lastReadAt ? createdAt <= lastReadAt : false,
  };

  const sceneId = item.scene_id?.S;
  if (sceneId) notification.sceneId = sceneId;

  const commentId = item.comment_id?.S;
  if (commentId) notification.commentId = commentId;

  const reactionType = item.reaction_type?.S;
  if (reactionType) notification.reactionType = reactionType;

  return notification;
}

async function emitNotification({
  recipientId,
  actorProfile,
  type,
  sceneId,
  commentId,
  reactionType,
}) {
  if (!ALLOWED_TYPES.has(type)) return;

  const actorUserId = actorProfile?.user_id?.S;
  if (!actorUserId || recipientId === actorUserId) return;

  try {
    const now = new Date().toISOString();
    const notificationId = `${now}#${randomUUID()}`;

    const item = {
      user_id: { S: recipientId },
      notification_id: { S: notificationId },
      type: { S: type },
      created_at: { S: now },
      ...actorFieldsFromProfile(actorProfile),
    };

    if (typeof sceneId === "string" && sceneId.trim() !== "") {
      item.scene_id = { S: sceneId };
    }
    if (typeof commentId === "string" && commentId.trim() !== "") {
      item.comment_id = { S: commentId };
    }
    if (typeof reactionType === "string" && reactionType.trim() !== "") {
      item.reaction_type = { S: reactionType };
    }

    await dynamo.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: NOTIFICATIONS_TABLE,
              Item: item,
            },
          },
          {
            Update: {
              TableName: PROFILES_TABLE,
              Key: { user_id: { S: recipientId } },
              UpdateExpression:
                "SET unread_count = if_not_exists(unread_count, :zero) + :one",
              ExpressionAttributeValues: {
                ":zero": { N: "0" },
                ":one": { N: "1" },
              },
            },
          },
        ],
      })
    );
  } catch (err) {
    console.error("emitNotification failed", { recipientId, type, err });
  }
}

async function markAllRead(userId) {
  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: PROFILES_TABLE,
      Key: { user_id: { S: userId } },
      UpdateExpression:
        "SET unread_count = :zero, notifications_last_read_at = :now",
      ExpressionAttributeValues: {
        ":zero": { N: "0" },
        ":now": { S: now },
      },
    })
  );
}

async function listNotifications({ userId, limit, exclusiveStartKey }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: NOTIFICATIONS_TABLE,
      KeyConditionExpression: "user_id = :userId",
      ExpressionAttributeValues: { ":userId": { S: userId } },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  return {
    items: result.Items ?? [],
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

function unreadCountFromProfile(item) {
  return counterValue(item, "unread_count");
}

function lastReadAtFromProfile(item) {
  return item?.notifications_last_read_at?.S ?? null;
}

module.exports = {
  emitNotification,
  markAllRead,
  notificationFromItem,
  listNotifications,
  unreadCountFromProfile,
  lastReadAtFromProfile,
};
