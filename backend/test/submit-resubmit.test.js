"use strict";

/**
 * Lightweight assertion-based tests for scene resubmission and quota
 * carry-forward — no test framework is configured in this package
 * (see CLAUDE.md §4), so this runs directly:
 *
 *   node backend/test/submit-resubmit.test.js
 *
 * This is the regression test for the reported bug: after cancelling a scene
 * the dashboard showed a Submit button (DashboardSceneCard.tsx's canSubmitScene
 * explicitly allows CANCELLED) and told the user "Processing cancelled. You can
 * submit again", but submit-job.js's SUBMITTABLE set omitted CANCELLED, so the
 * request came back
 *
 *   409  Scene is in CANCELLED state and cannot be submitted
 *
 * The second concern here is quota. Manual retries are charged at submit time
 * and cancelling never refunds, so simply adding CANCELLED to the allowlist
 * would double-bill the cancel-then-resubmit cycle. These tests pin the
 * carry-forward rule: one charge per intent-to-train, no matter how many
 * cancel/resubmit cycles it takes.
 */

const assert = require("node:assert/strict");

process.env.SCENES_TABLE_NAME = "test-scenes";
process.env.RAW_SCENES_BUCKET_NAME = "test-raw";
process.env.SPLAT_SCENES_BUCKET_NAME = "test-output";
process.env.JOB_QUOTA_EVENTS_TABLE_NAME = "test-quota";
process.env.SQS_QUEUE_URL = "https://sqs.test/standard";
process.env.SQS_QUEUE_URL_PRIORITY = "https://sqs.test/priority";
process.env.API_BASE_URL = "https://api.test";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { S3Client } = require("@aws-sdk/client-s3");

const sentCommands = [];
let responses = [];

class ConditionalCheckFailedException extends Error {
  constructor() {
    super("The conditional request failed");
    this.name = "ConditionalCheckFailedException";
  }
}

DynamoDBClient.prototype.send = async function send(command) {
  sentCommands.push(command);
  if (responses.length === 0) {
    throw new Error(`no canned response queued for ${command.constructor.name}`);
  }
  const next = responses.shift();
  if (next instanceof Error) throw next;
  return next;
};

// The queue and S3 are recorded but never assert-driven except where noted.
SQSClient.prototype.send = async function send(command) {
  sentCommands.push(command);
  return {};
};
S3Client.prototype.send = async function send(command) {
  sentCommands.push(command);
  return { ContentLength: 2048 };
};

const submitJob = require("../handlers/submit-job");

const SCENE_ID = "b5e75d62-515c-4fc6-aed7-56f8e6fb72c1";
const PRIOR_ATTEMPT_ID = "11111111-2222-3333-4444-555555555555";
const USER_ID = "u-1";

function reset() {
  sentCommands.length = 0;
  responses = [];
}

function submitEvent({ userId = USER_ID, body = { sceneId: SCENE_ID } } = {}) {
  return {
    requestContext: userId ? { authorizer: { jwt: { claims: { sub: userId } } } } : {},
    body: JSON.stringify(body),
  };
}

function sceneItem({ status, lastAttemptId = null, attemptCount = 1 }) {
  const item = {
    scene_id: { S: SCENE_ID },
    user_id: { S: USER_ID },
    status: { S: status },
    s3_key: { S: `uploads/${USER_ID}/scene.zip` },
    input_type: { S: "zip" },
    name: { S: "My Scene" },
    attempt_count: { N: String(attemptCount) },
  };
  if (lastAttemptId) item.last_attempt_id = { S: lastAttemptId };
  return item;
}

function priorAttempt({ status, quotaCharged = undefined, isManualRetry = undefined }) {
  const item = { scene_id: { S: PRIOR_ATTEMPT_ID }, status: { S: status } };
  if (quotaCharged !== undefined) item.quota_charged = { BOOL: quotaCharged };
  if (isManualRetry !== undefined) item.is_manual_retry = { BOOL: isManualRetry };
  return item;
}

/**
 * Canned responses for a submit that reaches the queue.
 *
 * Order mirrors submit-job.js: account status, tier, quota count, scene read,
 * [prior attempt read], conditional scene update, attempt PutItem, and finally
 * the optional MANUAL_RETRY quota PutItem. The trailing slot is always present
 * so a test can assert on whether the charge happened rather than crashing on
 * an exhausted queue; quotaPutItems() is what actually checks it.
 */
function submitFlow({ scene, prior = null, quotaUsed = 0 }) {
  const flow = [
    { Item: {} }, // getUserStatus -> no explicit status = active
    { Item: {} }, // getUserTier   -> defaults to free
    { Count: quotaUsed }, // getRollingWindowCount
    { Item: scene }, // scene read
  ];
  if (prior !== null) flow.push({ Item: prior }); // prior attempt read
  flow.push({ Attributes: { attempt_count: { N: "2" } } }); // conditional update
  flow.push({}); // attempt PutItem
  flow.push({}); // optional quota event PutItem
  return flow;
}

function commandsOfType(name) {
  return sentCommands.filter((c) => c.constructor.name === name);
}

function attemptPutItem() {
  return commandsOfType("PutItemCommand").find(
    (c) => c.input.TableName === "test-scenes",
  );
}

function quotaPutItems() {
  return commandsOfType("PutItemCommand").filter(
    (c) => c.input.TableName === "test-quota",
  );
}

let passed = 0;
async function test(name, fn) {
  reset();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  console.log("\nsubmit-job.js — submittable states");

  await test("accepts a CANCELLED scene (the reported 409)", async () => {
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: false }),
    });

    const res = await submitJob.handler(submitEvent());
    const body = JSON.parse(res.body);

    assert.equal(res.statusCode, 202, `expected 202, got ${res.statusCode}: ${res.body}`);
    assert.equal(body.status, "QUEUED");
    assert.ok(body.attemptId, "a fresh attempt id must be issued");
    assert.equal(commandsOfType("SendMessageCommand").length, 1, "must enqueue exactly one message");
  });

  for (const status of ["UPLOADED", "FAILED", "READY"]) {
    await test(`still accepts a ${status} scene (regression)`, async () => {
      const needsPrior = status !== "UPLOADED";
      responses = submitFlow({
        scene: sceneItem({
          status,
          lastAttemptId: needsPrior ? PRIOR_ATTEMPT_ID : null,
        }),
        prior: needsPrior ? priorAttempt({ status: "FAILED", quotaCharged: true }) : null,
      });

      const res = await submitJob.handler(submitEvent());
      assert.equal(res.statusCode, 202, `expected 202, got ${res.statusCode}: ${res.body}`);
    });
  }

  await test("still rejects a QUEUED scene with 409", async () => {
    responses = [
      { Item: {} },
      { Item: {} },
      { Count: 0 },
      { Item: sceneItem({ status: "QUEUED" }) },
    ];

    const res = await submitJob.handler(submitEvent());

    assert.equal(res.statusCode, 409, "a live job must still block resubmission");
    assert.match(JSON.parse(res.body).error, /QUEUED/);
    assert.equal(commandsOfType("SendMessageCommand").length, 0, "must not enqueue");
  });

  await test("still rejects a PROCESSING scene with 409", async () => {
    responses = [
      { Item: {} },
      { Item: {} },
      { Count: 0 },
      { Item: sceneItem({ status: "PROCESSING" }) },
    ];

    const res = await submitJob.handler(submitEvent());
    assert.equal(res.statusCode, 409);
  });

  await test("keeps the ConditionExpression in lockstep with SUBMITTABLE", async () => {
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: false }),
    });

    await submitJob.handler(submitEvent());

    const update = commandsOfType("UpdateItemCommand")[0];
    const values = update.input.ExpressionAttributeValues;
    const allowed = Object.keys(values)
      .filter((k) => /^:r\d+$/.test(k))
      .map((k) => values[k].S)
      .sort();
    // A stale ConditionExpression would make the pre-read check pass and then
    // fail the atomic write — a 409 that contradicts the check above it.
    assert.deepEqual(allowed, ["CANCELLED", "FAILED", "READY", "UPLOADED"]);
  });

  await test("returns 409 when the scene changes between read and write", async () => {
    const flow = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: false }),
    });
    // Make the conditional scene update (index 5, after the prior-attempt read)
    // fail its condition, as it would if a worker claimed the scene meanwhile.
    flow[5] = new ConditionalCheckFailedException();
    responses = flow;

    const res = await submitJob.handler(submitEvent());
    assert.equal(res.statusCode, 409);
    assert.match(JSON.parse(res.body).error, /status changed/i);
  });

  console.log("\nsubmit-job.js — quota carry-forward");

  await test("carries the charge forward instead of double-billing", async () => {
    // The unfair case: FAILED -> submit (charged) -> cancel -> resubmit.
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: true }),
    });

    await submitJob.handler(submitEvent());

    assert.equal(quotaPutItems().length, 0, "must not charge twice for one intent-to-train");
    const put = attemptPutItem();
    assert.equal(put.input.Item.quota_charged.BOOL, true, "the new attempt still holds the charge");
    assert.equal(
      put.input.Item.quota_carried_from.S,
      PRIOR_ATTEMPT_ID,
      "and records where it came from",
    );
    assert.equal(
      put.input.Item.is_manual_retry.BOOL,
      true,
      "attempt-patch.js reads this to skip the COMPLETION charge",
    );
  });

  await test("reads is_manual_retry as a fallback for pre-existing attempts", async () => {
    // Attempts created before quota_charged existed still carry the fact in
    // is_manual_retry, so they must not be re-charged either.
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", isManualRetry: true }),
    });

    await submitJob.handler(submitEvent());

    assert.equal(quotaPutItems().length, 0, "legacy flag must be honoured");
    assert.equal(attemptPutItem().input.Item.quota_charged.BOOL, true);
  });

  await test("charges once when the cancelled attempt held no charge", async () => {
    // UPLOADED -> submit (uncharged) -> cancel -> resubmit. Nothing was ever
    // billed, so this retry pays for itself.
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: false }),
    });

    await submitJob.handler(submitEvent());

    assert.equal(quotaPutItems().length, 1, "exactly one charge");
    assert.equal(quotaPutItems()[0].input.Item.event_type.S, "MANUAL_RETRY");
    assert.equal(attemptPutItem().input.Item.quota_charged.BOOL, true);
    assert.equal(
      attemptPutItem().input.Item.quota_carried_from,
      undefined,
      "nothing was inherited, so no provenance field",
    );
  });

  await test("cancel-thrashing costs exactly one slot, not one per cycle", async () => {
    // Cycle 1: cancelled attempt held no charge -> charge now.
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: false }),
    });
    await submitJob.handler(submitEvent());
    const firstCycleCharges = quotaPutItems().length;
    const nowCharged = attemptPutItem().input.Item.quota_charged.BOOL;

    // Cycle 2: that attempt is cancelled in turn, now holding the charge.
    reset();
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: nowCharged }),
    });
    await submitJob.handler(submitEvent());

    assert.equal(firstCycleCharges, 1, "first cycle pays");
    assert.equal(quotaPutItems().length, 0, "every later cycle is free");
  });

  await test("does not carry forward from a FAILED attempt (GPU time was spent)", async () => {
    responses = submitFlow({
      scene: sceneItem({ status: "FAILED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "FAILED", quotaCharged: true }),
    });

    await submitJob.handler(submitEvent());

    assert.equal(
      quotaPutItems().length,
      1,
      "retrying a genuinely failed run is a new charge — only cancels carry forward",
    );
  });

  await test("a first submission from UPLOADED still charges nothing at submit", async () => {
    responses = submitFlow({ scene: sceneItem({ status: "UPLOADED" }), prior: null });

    await submitJob.handler(submitEvent());

    assert.equal(quotaPutItems().length, 0, "billed on success in attempt-patch.js instead");
    const put = attemptPutItem();
    assert.equal(put.input.Item.quota_charged.BOOL, false);
    assert.equal(put.input.Item.is_manual_retry.BOOL, false);
  });

  await test("skips the prior-attempt read entirely for a first submission", async () => {
    // Baseline: account status + tier + scene = 3 reads, with no prior attempt
    // to consult. The carry-forward lookup must not add latency to the common
    // first-submit path.
    responses = submitFlow({ scene: sceneItem({ status: "UPLOADED" }), prior: null });
    await submitJob.handler(submitEvent());
    const firstSubmitReads = commandsOfType("GetItemCommand").length;

    // A resubmit does one more read — the prior attempt — proving the skip
    // above is real and not just an artefact of the counting.
    reset();
    responses = submitFlow({
      scene: sceneItem({ status: "CANCELLED", lastAttemptId: PRIOR_ATTEMPT_ID }),
      prior: priorAttempt({ status: "CANCELLED", quotaCharged: true }),
    });
    await submitJob.handler(submitEvent());
    const resubmitReads = commandsOfType("GetItemCommand").length;

    assert.equal(firstSubmitReads, 3, "account status + tier + scene");
    assert.equal(resubmitReads, 4, "and the prior attempt on a resubmit");
  });

  await test("still enforces the weekly quota ceiling", async () => {
    responses = [
      { Item: {} },
      { Item: {} },
      { Count: 999 }, // over the free-tier limit
    ];

    const res = await submitJob.handler(submitEvent());

    assert.equal(res.statusCode, 429);
    assert.equal(commandsOfType("SendMessageCommand").length, 0);
  });

  console.log(`\n${passed} assertions passed\n`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
