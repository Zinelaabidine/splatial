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

function emailFromClaims(claims) {
  const email = claims?.email;
  return typeof email === "string" && email.includes("@") ? email.trim() : null;
}

// ---------------------------------------------------------------------------
// Notification preferences — per-type "email me when X happens" toggles.
// Default is true for everyone: an attribute that was never written (older
// profiles, or a type the user hasn't touched) reads as opted-in, matching
// "by default all by email" from the product ask.
// ---------------------------------------------------------------------------

const NOTIFY_EMAIL_TYPES = ["follow", "reaction", "comment", "mention", "jobStatus"];

const NOTIFY_EMAIL_ATTR = {
  follow: "notify_email_follow",
  reaction: "notify_email_reaction",
  comment: "notify_email_comment",
  mention: "notify_email_mention",
  jobStatus: "notify_email_job_status",
};

function notifyEmailFromItem(item) {
  const prefs = {};
  for (const type of NOTIFY_EMAIL_TYPES) {
    const attr = item?.[NOTIFY_EMAIL_ATTR[type]];
    prefs[type] = attr?.BOOL !== undefined ? attr.BOOL : true;
  }
  return prefs;
}

/** Whether the recipient wants an email for a given notification type. Defaults to true. */
function wantsEmailFor(profileItem, type) {
  const attr = profileItem?.[NOTIFY_EMAIL_ATTR[type]];
  return attr?.BOOL !== undefined ? attr.BOOL : true;
}

/** Validate a partial { follow?, reaction?, comment?, mention?, jobStatus? } patch. */
function validateNotifyEmailPatch(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "notifyEmail must be an object" };
  }
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (!NOTIFY_EMAIL_TYPES.includes(key)) {
      return { ok: false, error: `notifyEmail.${key} is not a recognized field` };
    }
    if (typeof value !== "boolean") {
      return { ok: false, error: `notifyEmail.${key} must be a boolean` };
    }
    patch[key] = value;
  }
  return { ok: true, patch };
}

const ALLOWED_DEFAULT_VISIBILITY = new Set(["PUBLIC", "PRIVATE"]);

function validateDefaultVisibility(raw) {
  if (typeof raw !== "string" || !ALLOWED_DEFAULT_VISIBILITY.has(raw)) {
    return { ok: false, error: "defaultVisibility must be PUBLIC or PRIVATE" };
  }
  return { ok: true, defaultVisibility: raw };
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

async function profileResponseFromItem(item, includePrivate = false) {
  let avatarUrl = null;
  const avatarKey = item.avatar_key?.S;
  const avatarBucket = item.avatar_bucket?.S;
  if (avatarKey && avatarBucket) {
    avatarUrl = await presignedAvatarUrl(avatarBucket, avatarKey);
  }

  const body = {
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

  // Private fields — only ever attached for the caller's own profile (see
  // profile-get-me.js / profile-update-me.js). Never leak to
  // profile-get-by-username.js's public lookup.
  if (includePrivate) {
    body.email = item.email?.S ?? null;
    body.notifyEmail = notifyEmailFromItem(item);
    body.defaultVisibility = item.default_visibility?.S === "PUBLIC" ? "PUBLIC" : "PRIVATE";
  }

  return body;
}

function buildMinimalProfileItem(userId, displayName, now, email) {
  const item = {
    user_id: { S: userId },
    display_name: { S: displayName },
    followers_count: { N: "0" },
    following_count: { N: "0" },
    scenes_count: { N: "0" },
    created_at: { S: now },
    updated_at: { S: now },
  };
  if (email) item.email = { S: email };
  return item;
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
  emailFromClaims,
  counterValue,
  profileResponseFromItem,
  buildMinimalProfileItem,
  resolveUserIdByUsername,
  NOTIFY_EMAIL_TYPES,
  NOTIFY_EMAIL_ATTR,
  notifyEmailFromItem,
  wantsEmailFor,
  validateNotifyEmailPatch,
  validateDefaultVisibility,
};
