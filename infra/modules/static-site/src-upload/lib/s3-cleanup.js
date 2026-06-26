"use strict";

const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");

/**
 * Best-effort delete of every object under an S3 prefix (paginated).
 * Logs warnings and continues on partial failures.
 */
async function deleteObjectsUnderPrefix(s3, bucket, prefix, logContext = {}) {
  if (!bucket || !prefix) return 0;

  let deleted = 0;
  let continuationToken;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (list.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key) => typeof key === "string" && key.length > 0);

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
      if (batch.length === 0) continue;

      try {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch, Quiet: true },
          })
        );
        deleted += batch.length;
      } catch (err) {
        console.warn("s3 batch delete failed", {
          ...logContext,
          bucket,
          prefix,
          batchSize: batch.length,
          err: err.message,
        });
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

/** Delete a single object; ignore NoSuchKey. */
async function deleteObjectIfPresent(s3, bucket, key, logContext = {}) {
  if (!bucket || !key) return false;

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.warn("s3 object delete skipped", {
      ...logContext,
      bucket,
      key,
      err: err.message,
    });
    return false;
  }
}

/** Abort an in-progress multipart upload when uploadId + key are known. */
async function abortMultipartUploadIfPresent(s3, bucket, key, uploadId, logContext = {}) {
  if (!bucket || !key || !uploadId) return false;

  try {
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
    return true;
  } catch (err) {
    console.warn("multipart abort skipped", {
      ...logContext,
      bucket,
      key,
      uploadId,
      err: err.message,
    });
    return false;
  }
}

module.exports = {
  deleteObjectsUnderPrefix,
  deleteObjectIfPresent,
  abortMultipartUploadIfPresent,
  S3Client,
};
