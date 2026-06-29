"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { GetItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({});
const URL_TTL_S = 3600;

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "me",
  "settings",
  "u",
  "explore",
  "feed",
  "support",
  "about",
]);

const USERNAME_REGEX = /^[a-z0-9_]+$/;

function normalizeUsername(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function validateUsername(raw) {
  const username = normalizeUsername(raw);
  if (username.length < 3 || username.length > 20) {
    return { ok: false, error: "Username must be 3–20 characters" };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { ok: false, error: "Username may only contain lowercase letters, numbers, and underscores" };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: "Username is reserved" };
  }
  return { ok: true, username };
}

function validateDisplayName(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "displayName must be a non-empty string" };
  }
  const displayName = raw.trim();
  if (displayName.length > 50) {
    return { ok: false, error: "displayName must be at most 50 characters" };
  }
  return { ok: true, displayName };
}

function validateBio(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "bio must be a string" };
  }
  const bio = raw.trim();
  if (bio.length > 280) {
    return { ok: false, error: "bio must be at most 280 characters" };
  }
  return { ok: true, bio };
}

function displayNameFromClaims(claims) {
  const email = claims?.email;
  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[0];
  }
  return "User";
}

function counterValue(item, field) {
  const n = item?.[field]?.N;
  if (n === undefined) return 0;
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function presignedAvatarUrl(bucket, key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: URL_TTL_S }
  );
}

async function profileResponseFromItem(item) {
  let avatarUrl = null;
  const avatarKey = item.avatar_key?.S;
  const avatarBucket = item.avatar_bucket?.S;
  if (avatarKey && avatarBucket) {
    avatarUrl = await presignedAvatarUrl(avatarBucket, avatarKey);
  }

  return {
    userId: item.user_id?.S ?? "",
    username: item.username?.S ?? null,
    displayName: item.display_name?.S ?? "",
    bio: item.bio?.S ?? "",
    avatarUrl,
    followersCount: counterValue(item, "followers_count"),
    followingCount: counterValue(item, "following_count"),
    scenesCount: counterValue(item, "scenes_count"),
    unreadCount: counterValue(item, "unread_count"),
    createdAt: item.created_at?.S ?? "",
  };
}

function buildMinimalProfileItem(userId, displayName, now) {
  return {
    user_id: { S: userId },
    display_name: { S: displayName },
    followers_count: { N: "0" },
    following_count: { N: "0" },
    scenes_count: { N: "0" },
    created_at: { S: now },
    updated_at: { S: now },
  };
}

async function resolveUserIdByUsername(dynamo, username) {
  const usernamesTable = process.env.USERNAMES_TABLE_NAME;
  const profilesTable = process.env.PROFILES_TABLE_NAME;

  const usernameRow = await dynamo.send(
    new GetItemCommand({
      TableName: usernamesTable,
      Key: { username: { S: username } },
    })
  );

  let ownerId = usernameRow.Item?.user_id?.S;

  if (!ownerId) {
    const gsi = await dynamo.send(
      new QueryCommand({
        TableName: profilesTable,
        IndexName: "username-index",
        KeyConditionExpression: "username = :username",
        ExpressionAttributeValues: { ":username": { S: username } },
        Limit: 1,
      })
    );
    ownerId = gsi.Items?.[0]?.user_id?.S;
  }

  return ownerId ?? null;
}

module.exports = {
  RESERVED_USERNAMES,
  normalizeUsername,
  validateUsername,
  validateDisplayName,
  validateBio,
  displayNameFromClaims,
  counterValue,
  profileResponseFromItem,
  buildMinimalProfileItem,
  resolveUserIdByUsername,
};
