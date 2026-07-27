"use strict";

/**
 * Single source of truth for the SQS job-message body consumed by
 * worker/worker.py's parse_message_body().
 *
 * Two call sites enqueue work and must produce byte-identical shapes:
 *   - handlers/submit-job.js  — a user submitting or resubmitting a scene.
 *   - handlers/attempts-reap.js — the lease reaper recovering an attempt whose
 *     worker died without reporting (see reaper.tf).
 *
 * Keeping the shape here rather than inline in both means a field added for one
 * path can't silently go missing on the other. worker.py rejects a message with
 * missing required fields, so drift shows up as a message that DLQs after three
 * receives with no training run — the exact failure this module exists to avoid.
 */

/**
 * S3 prefix for an attempt's generated output.
 *
 * Attempt-scoped by construction, which is what makes duplicate processing of
 * the same attempt safe: two workers racing the same attempt write the same
 * bytes to the same place rather than interleaving into one another's output.
 */
function buildOutputPrefix(s3Key, attemptId) {
  return `${s3Key}/output/attempt-${attemptId}/`;
}

/**
 * Assemble the SQS message body for one training attempt.
 *
 * @param {object}  args
 * @param {string}  args.sceneId
 * @param {string}  args.attemptId
 * @param {string}  args.userId
 * @param {string}  args.sceneName
 * @param {number}  args.attemptNumber
 * @param {string}  args.inputBucket
 * @param {string}  args.inputPrefix       raw-scenes S3 key
 * @param {string}  args.inputFileType     "zip" | "images" | "video"
 * @param {number}  args.inputFileCount
 * @param {number}  args.inputSizeBytes
 * @param {string}  args.outputBucket
 * @param {string}  args.outputPrefix
 * @param {string}  args.apiBaseUrl
 * @param {string}  args.apiAuthToken      per-attempt worker token
 * @param {string}  args.queuedAt          ISO 8601
 * @param {number}  args.maxAttempts
 * @param {object}  args.trainConfig       already validated + merged
 * @param {object}  args.colmapConfig      already validated + merged
 * @param {number} [args.requeueCount]     infrastructure requeues so far
 * @param {number} [args.maxRequeues]      cap before the job is failed
 * @returns {string} JSON string ready for SendMessageCommand.MessageBody
 */
function buildJobMessage({
  sceneId,
  attemptId,
  userId,
  sceneName,
  attemptNumber,
  inputBucket,
  inputPrefix,
  inputFileType,
  inputFileCount,
  inputSizeBytes,
  outputBucket,
  outputPrefix,
  apiBaseUrl,
  apiAuthToken,
  queuedAt,
  maxAttempts,
  trainConfig,
  colmapConfig,
  requeueCount = 0,
  maxRequeues,
}) {
  return JSON.stringify({
    sceneId,
    attemptId,
    userId,
    sceneName,
    attemptNumber,
    inputBucket,
    inputPrefix,
    inputFileType,
    inputFileCount,
    inputSizeBytes,
    outputBucket,
    outputPrefix,
    apiBaseUrl,
    apiAuthToken,
    queuedAt,
    maxAttempts,
    trainConfig,
    colmapConfig,
    // Carried on the message so a worker re-enqueueing itself after a Spot
    // interruption can enforce the cap without a DynamoDB read. worker.py
    // treats both as optional, so messages written before this existed still
    // parse (requeue_count defaults to 0).
    requeueCount,
    ...(typeof maxRequeues === "number" ? { maxRequeues } : {}),
  });
}

module.exports = { buildJobMessage, buildOutputPrefix };
