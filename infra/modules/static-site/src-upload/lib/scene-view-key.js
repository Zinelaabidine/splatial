"use strict";

const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

const THUMBNAIL_FILENAME = "thumbnail.jpg";

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
    console.error("scene-view-key manifest lookup failed", {
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

/**
 * Resolves the S3 object key for the scene's viewable .splat or .ply file.
 *
 * @param {import("@aws-sdk/client-dynamodb").AttributeMap} item DynamoDB scene row
 * @param {string} defaultBucket Fallback bucket when output_bucket is absent
 * @returns {Promise<{ bucket: string, key: string } | null>}
 */
async function resolveSceneViewObject(item, defaultBucket) {
  const plyKey = item.ply_key?.S;
  const bucket = item.output_bucket?.S ?? defaultBucket;

  if (plyKey) {
    return { bucket, key: plyKey };
  }

  const tried = new Set();
  const outputPrefix = item.output_prefix?.S;
  if (outputPrefix) {
    const normalized = outputPrefix.replace(/\/$/, "");
    tried.add(normalized);
    const key = await resolveViewKeyFromPrefix(bucket, normalized);
    if (key) return { bucket, key };
  }

  const s3Key = item.s3_key?.S;
  if (!s3Key) return null;

  const attemptPrefixes = await listAttemptPrefixes(bucket, s3Key);
  for (const attemptPrefix of attemptPrefixes) {
    if (tried.has(attemptPrefix)) continue;
    tried.add(attemptPrefix);
    const key = await resolveViewKeyFromPrefix(bucket, attemptPrefix);
    if (key) return { bucket, key };
  }

  return null;
}

/** Thumbnail lives alongside the splat/ply artifact in the same S3 prefix. */
function thumbnailKeyForViewKey(viewKey) {
  const lastSlash = viewKey.lastIndexOf("/");
  const dir = lastSlash >= 0 ? viewKey.slice(0, lastSlash + 1) : "";
  return `${dir}${THUMBNAIL_FILENAME}`;
}

module.exports = {
  THUMBNAIL_FILENAME,
  resolveSceneViewObject,
  thumbnailKeyForViewKey,
};
