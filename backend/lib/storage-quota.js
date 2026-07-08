"use strict";

const { GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { ListObjectsV2Command, HeadObjectCommand } = require("@aws-sdk/client-s3");

/**
 * Per-tier hard storage cap, in bytes. Counts raw source + generated output
 * combined (see getStorageUsedBytes / adjustStorageUsedBytes below) — both
 * write to the same per-user running total on the `users` table.
 *
 * Binary (GiB, 1024^3) rather than decimal — matches how cloud storage caps
 * are conventionally communicated ("1GB" meaning 2^30 bytes in practice).
 */
const STORAGE_CAP_BYTES = Object.freeze({
  free: 1 * 1024 * 1024 * 1024,
  pro: 10 * 1024 * 1024 * 1024,
});

const DEFAULT_TIER = "free";

function getStorageCapBytes(tier) {
  return STORAGE_CAP_BYTES[tier] ?? STORAGE_CAP_BYTES[DEFAULT_TIER];
}

/** Current running total (bytes) counted against a user's storage cap. Missing row/attribute = 0. */
async function getStorageUsedBytes(dynamo, userId) {
  const usersTable = process.env.USERS_TABLE_NAME;
  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: usersTable, Key: { user_id: { S: userId } } })
  );
  return Number(Item?.storage_bytes_used?.N ?? 0);
}

/**
 * Atomically adjust a user's running storage total. `deltaBytes` may be
 * negative (deletion/shrink). Uses ADD, the same atomic-increment pattern
 * submit-job.js already uses for attempt_count — safe under concurrent
 * uploads/deletes, and upserts the users-table row if it doesn't exist yet
 * (consistent with getUserTier's "missing row = default" treatment).
 */
async function adjustStorageUsedBytes(dynamo, userId, deltaBytes) {
  if (!deltaBytes) return;
  const usersTable = process.env.USERS_TABLE_NAME;
  await dynamo.send(
    new UpdateItemCommand({
      TableName: usersTable,
      Key: { user_id: { S: userId } },
      UpdateExpression: "ADD storage_bytes_used :delta",
      ExpressionAttributeValues: { ":delta": { N: String(deltaBytes) } },
    })
  );
}

/**
 * Sum object sizes under an S3 prefix (paginated) — used to size a scene's
 * generated output, which may be more than one file (manifest.json plus one
 * or more artifacts) under a single attempt's output prefix.
 */
async function sumObjectSizesUnderPrefix(s3, bucket, prefix) {
  if (!bucket || !prefix) return 0;

  let total = 0;
  let continuationToken;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of list.Contents ?? []) {
      total += obj.Size ?? 0;
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  return total;
}

/** Size of a single S3 object, or 0 if it can't be read (non-fatal — informational). */
async function getObjectSizeBytes(s3, bucket, key) {
  if (!bucket || !key) return 0;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? 0;
  } catch {
    return 0;
  }
}

module.exports = {
  STORAGE_CAP_BYTES,
  getStorageCapBytes,
  getStorageUsedBytes,
  adjustStorageUsedBytes,
  sumObjectSizesUnderPrefix,
  getObjectSizeBytes,
};
