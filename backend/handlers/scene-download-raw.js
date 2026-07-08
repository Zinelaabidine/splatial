"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const logger = require("../lib/logger");
const { requirePaidOwnerScene } = require("../lib/download-gate");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const RAW_BUCKET = process.env.RAW_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;

/**
 * GET /api/v1/scenes/{sceneId}/download/raw
 *
 * Presigned S3 GET for the scene's original raw source upload. Owner-only
 * and gated to paid tiers (see lib/download-gate.js) — a free-tier owner
 * can still view/train their scene, just not export the raw asset off the
 * platform. If retention-sweep.js has already deleted the raw object
 * (raw_deleted_at set), this returns 410 rather than presigning a dead key.
 *
 * Success (200): { sceneId, url, expiresIn }
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "scene-download-raw");
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId) return response(400, { error: "Missing path parameter: sceneId" });

  const gate = await requirePaidOwnerScene(dynamo, TABLE, sceneId, userId);
  if (!gate.ok) {
    if (gate.statusCode === 403 && gate.body.requiredTier) {
      log.event("download.blocked", {
        sceneId,
        data: { kind: "raw", tier: gate.body.tier },
      });
    }
    return response(gate.statusCode, gate.body);
  }

  const item = gate.item;
  if (item.raw_deleted_at?.S) {
    return response(410, { error: "Raw source has been deleted per retention policy" });
  }

  const key = item.s3_key?.S;
  if (!key) return response(404, { error: "Scene has no raw source associated" });

  const filename = key.split("/").pop();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: RAW_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: URL_TTL_S }
  );

  log.event("download.served", { sceneId, data: { kind: "raw" } });
  return response(200, { sceneId, url, expiresIn: URL_TTL_S, filename });
};
