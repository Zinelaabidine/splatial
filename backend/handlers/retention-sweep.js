"use strict";

const { DynamoDBClient, QueryCommand, UpdateItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");
const { deleteObjectIfPresent, deleteObjectsUnderPrefix } = require("../lib/s3-cleanup");
const { adjustStorageUsedBytes } = require("../lib/storage-quota");

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});

const TABLE = process.env.SCENES_TABLE_NAME;
const RAW_BUCKET = process.env.RAW_SCENES_BUCKET_NAME;

const GSI_NAME = "raw_retention_status-raw_expires_at-index";
const PAGE_SIZE = 100;

/**
 * INTERNAL /retention/sweep
 *
 * NOT an API Gateway route — invoked only by the EventBridge rule in
 * retention.tf (rate(1 day)), with a synthetic
 * { routeKey: "INTERNAL /retention/sweep" } event. No admin-JWT gate needed:
 * nothing outside EventBridge can reach this routeKey.
 *
 * Deletes the RAW source (images/video) for scenes whose raw-retention
 * window has elapsed since their most recent successful training completion
 * (see attempt-patch.js, which sets raw_retention_status/raw_expires_at on
 * SUCCEEDED, and lib/retention.js for the per-tier window). The generated
 * output (.splat/.ply) is never touched here — retention is raw-source-only
 * by design. Paid-tier scenes (or any tier with no retention window) never
 * appear in the raw_retention_status-raw_expires_at-index GSI at all, since
 * it's a sparse index — attempt-patch.js only writes those two attributes
 * when computeRawExpiresAt() returned non-null.
 *
 * No fallback sweep for FAILED/abandoned scenes — those are cleaned up by
 * either the user manually deleting them or by storage-cap pressure at
 * upload time, not by this job.
 */
exports.handler = async () => {
  const nowIso = new Date().toISOString();
  let lastEvaluatedKey;
  let swept = 0;
  let failed = 0;
  let bytesFreed = 0;

  do {
    const { Items, LastEvaluatedKey } = await dynamo.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: GSI_NAME,
        KeyConditionExpression: "raw_retention_status = :pending AND raw_expires_at <= :now",
        ExpressionAttributeValues: {
          ":pending": { S: "PENDING" },
          ":now": { S: nowIso },
        },
        Limit: PAGE_SIZE,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const keyItem of Items ?? []) {
      const sceneId = keyItem.scene_id?.S;
      if (!sceneId) continue;
      try {
        const freed = await sweepScene(sceneId);
        swept += 1;
        bytesFreed += freed;
      } catch (err) {
        failed += 1;
        console.error("retention-sweep: scene sweep failed", { sceneId, err: err.message });
      }
    }

    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log("retention-sweep: run complete", { swept, failed, bytesFreed });
};

/** Delete one scene's raw source and update its bookkeeping. Returns bytes freed. */
async function sweepScene(sceneId) {
  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { scene_id: { S: sceneId } } })
  );
  if (!Item) return 0; // deleted by the user (or a previous sweep) in the meantime

  // Re-check under the item's own current data — the GSI query page can be
  // stale by the time we get here (user deleted the scene, or a resubmit
  // reset raw_expires_at to a later date, between the Query and this read).
  if (Item.raw_retention_status?.S !== "PENDING") return 0;

  const userId = Item.user_id?.S;
  const s3Key = Item.s3_key?.S ?? null;
  const rawBytes = Number(Item.raw_size_bytes?.N ?? 0);

  if (s3Key) {
    await deleteObjectIfPresent(s3, RAW_BUCKET, s3Key, { sceneId });
  }
  if (userId) {
    // Matches the prefix scene-delete.js already uses for the same bucket —
    // catches any stray parts/objects under this scene beyond the primary key.
    await deleteObjectsUnderPrefix(s3, RAW_BUCKET, `users/${userId}/${sceneId}`, { sceneId });
  }

  if (rawBytes > 0 && userId) {
    await adjustStorageUsedBytes(dynamo, userId, -rawBytes);
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
      UpdateExpression:
        "SET raw_deleted_at = :now, raw_size_bytes = :zero REMOVE raw_retention_status, raw_expires_at",
      ExpressionAttributeValues: {
        ":now": { S: new Date().toISOString() },
        ":zero": { N: "0" },
      },
    })
  );

  return rawBytes;
}
