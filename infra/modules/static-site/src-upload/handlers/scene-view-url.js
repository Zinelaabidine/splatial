"use strict";

const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");

const s3     = new S3Client({});
const dynamo = new DynamoDBClient({});

const TABLE        = process.env.SCENES_TABLE_NAME;
const SPLAT_BUCKET = process.env.SPLAT_SCENES_BUCKET_NAME;
const URL_TTL_S    = 3600; // 1 hour

function pickSplatFromManifest(manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const splats = files.filter((f) => typeof f === "string" && f.endsWith(".splat"));
  if (splats.length === 0) return null;

  const scored = splats.map((f) => {
    const match = f.match(/iteration_(\d+)/);
    const iter = match ? parseInt(match[1], 10) : -1;
    const isPointCloud = f.endsWith("point_cloud.splat");
    return { f, iter, isPointCloud };
  });

  scored.sort((a, b) => {
    if (a.isPointCloud !== b.isPointCloud) return a.isPointCloud ? -1 : 1;
    return b.iter - a.iter;
  });

  return scored[0].f;
}

async function loadManifest(bucket, outputPrefix) {
  const manifestKey = `${outputPrefix.replace(/\/$/, "")}/manifest.json`;
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: manifestKey })
  );
  const body = await resp.Body.transformToString();
  return JSON.parse(body);
}

async function objectExists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function resolveViewKeyFromPrefix(bucket, prefix) {
  const normalized = prefix.replace(/\/$/, "");

  try {
    const manifest = await loadManifest(bucket, normalized);
    const rel = pickSplatFromManifest(manifest);
    if (rel) return `${normalized}/${rel.replace(/^\.\//, "")}`;
  } catch (err) {
    console.error("scene-view-url manifest lookup failed", {
      outputPrefix: normalized,
      message: err.message,
    });
  }

  const outputSplatKey = `${normalized}/output.splat`;
  if (await objectExists(bucket, outputSplatKey)) {
    return outputSplatKey;
  }

  return null;
}

async function listAttemptPrefixes(bucket, s3Key) {
  const root = `${s3Key.replace(/\/$/, "")}/output/`;
  const prefixes = [];
  let continuationToken;

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: root,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      })
    );

    for (const entry of resp.CommonPrefixes ?? []) {
      const prefix = entry.Prefix?.replace(/\/$/, "");
      if (prefix && prefix.includes("/attempt-")) {
        prefixes.push(prefix);
      }
    }

    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);

  return prefixes.sort().reverse();
}

async function resolveViewKey(item) {
  const plyKey = item.ply_key?.S;
  if (plyKey) return plyKey;

  const bucket = item.output_bucket?.S ?? SPLAT_BUCKET;
  const tried = new Set();

  const outputPrefix = item.output_prefix?.S;
  if (outputPrefix) {
    const normalized = outputPrefix.replace(/\/$/, "");
    tried.add(normalized);
    const key = await resolveViewKeyFromPrefix(bucket, normalized);
    if (key) return key;
  }

  const s3Key = item.s3_key?.S;
  if (!s3Key) return null;

  const attemptPrefixes = await listAttemptPrefixes(bucket, s3Key);
  for (const attemptPrefix of attemptPrefixes) {
    if (tried.has(attemptPrefix)) continue;
    tried.add(attemptPrefix);
    const key = await resolveViewKeyFromPrefix(bucket, attemptPrefix);
    if (key) return key;
  }

  return null;
}

/**
 * GET /api/v1/scenes/{sceneId}/view-url
 *
 * Generates a presigned S3 GET URL for the scene's .splat or .ply file, valid for 1 hour.
 * The browser-side Gaussian Splat viewer fetches the asset directly from S3.
 *
 * Success response (200):
 *   { "sceneId": "...", "url": "https://s3.amazonaws.com/...", "expiresIn": 3600 }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const sceneId = event.pathParameters?.sceneId;
  if (!sceneId) return response(400, { error: "Missing path parameter: sceneId" });

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { scene_id: { S: sceneId } },
    })
  );

  const item = result.Item;
  if (!item) return response(404, { error: "Scene not found" });

  if (item.user_id?.S !== userId) {
    return response(403, { error: "Forbidden: scene does not belong to this user" });
  }

  if (item.status?.S !== "READY") {
    return response(409, { error: "Scene is not ready", status: item.status?.S ?? "UNKNOWN" });
  }

  const viewKey = await resolveViewKey(item);
  if (!viewKey) {
    return response(409, { error: "Scene has no viewable splat file associated" });
  }

  const bucket = item.output_bucket?.S ?? SPLAT_BUCKET;
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: viewKey }),
    { expiresIn: URL_TTL_S }
  );

  return response(200, { sceneId, url, expiresIn: URL_TTL_S });
};
