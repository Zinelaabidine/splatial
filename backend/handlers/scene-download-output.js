"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const logger = require("../lib/logger");
const { requirePaidOwnerScene } = require("../lib/download-gate");
const { resolveSceneViewObject } = require("../lib/scene-view-key");

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S = 3600;

/**
 * GET /api/v1/scenes/{sceneId}/download/output
 *
 * Presigned S3 GET for the scene's generated splat/ply output — the same
 * artifact scene-view-url.js streams into the in-browser viewer, but with
 * Content-Disposition: attachment so the browser saves it instead of
 * rendering it, and gated to paid-tier owners only (see
 * lib/download-gate.js). Unlike view-url.js this does not extend to
 * non-owners of a PUBLIC scene — downloading is a self-service export of
 * your own generated asset, not a viewing permission.
 *
 * Success (200): { sceneId, url, expiresIn, filename }
 */
exports.handler = async (event) => {
  const log = logger.forEvent(event, "scene-download-output");
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
        data: { kind: "output", tier: gate.body.tier },
      });
    }
    return response(gate.statusCode, gate.body);
  }

  const item = gate.item;
  if (item.status?.S !== "READY") {
    return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
  }

  const viewObject = await resolveSceneViewObject(item, SPLAT_BUCKET);
  if (!viewObject) {
    return response(409, { error: "Scene has no downloadable output file associated" });
  }

  const filename = viewObject.key.split("/").pop();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: viewObject.bucket,
      Key: viewObject.key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: URL_TTL_S }
  );

  log.event("download.served", { sceneId, data: { kind: "output" } });
  return response(200, { sceneId, url, expiresIn: URL_TTL_S, filename });
};
