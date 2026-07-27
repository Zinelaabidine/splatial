"use strict";

/**
 * Lightweight assertion-based tests for the attempt-lease reaper — no test
 * framework is configured in this package (see CLAUDE.md §4), so this runs
 * directly:
 *
 *   node backend/test/attempts-reap.test.js
 *
 * The reaper closes two stuck states that nothing else could:
 *
 *   - PROCESSING forever, after a hard crash / OOM / Spot hardware kill that
 *     sent no PATCH at all. No worker-side code can cover this case, because
 *     the worker is gone.
 *   - QUEUED with no message, once maxReceiveCount (3, sqs.tf) is exhausted and
 *     the message lands in a DLQ with no redrive-back policy.
 *
 * A reaper bug is unusually expensive — it can mass-requeue or mass-fail live
 * work — so the invariants below are worth pinning hard:
 *
 *   1. It only ever touches attempts that are PROCESSING with an expired lease.
 *   2. Cancellation always wins over recovery.
 *   3. Recovery rotates worker_token, so a worker that turns out to be alive is
 *      fenced out by the existing 403 checks rather than racing the replacement.
 *   4. Every write is conditioned on the attempt still being PROCESSING, so a
 *      worker reporting in mid-sweep makes the whole recovery a no-op.
 *   5. Dry-run writes nothing at all.
 */

const assert = require("node:assert/strict");

process.env.SCENES_TABLE_NAME = "test-scenes";
process.env.RAW_SCENES_BUCKET_NAME = "test-raw";
process.env.SPLAT_SCENES_BUCKET_NAME = "test-output";
process.env.SQS_QUEUE_URL = "https://sqs.test/standard";
process.env.SQS_QUEUE_URL_PRIORITY = "https://sqs.test/priority";
process.env.API_BASE_URL = "https://api.test";
process.env.ATTEMPT_MAX_REQUEUES = "5";
// Armed by default in tests; the dry-run case re-requires the module with it on.
process.env.ATTEMPT_REAPER_DRY_RUN = "false";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");

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

SQSClient.prototype.send = async function send(command) {
  sentCommands.push(command);
  return { MessageId: "m-1" };
};

const attemptsReap = require("../handlers/attempts-reap");

const ATTEMPT_ID = "3f8a1c22-9b41-4a0e-8d77-2e5c9f0b1a34";
const SCENE_ID = "b5e75d62-515c-4fc6-aed7-56f8e6fb72c1";
const USER_ID = "u-1";
const OLD_TOKEN = "old-worker-token";

function reset() {
  sentCommands.length = 0;
  responses = [];
}

function attemptRow({
  status = "PROCESSING",
  requeueCount = 0,
  cancelRequested = false,
  leaseActive = true,
  tier = "free",
} = {}) {
  const item = {
    scene_id: { S: ATTEMPT_ID },
    record_type: { S: "attempt" },
    parent_scene_id: { S: SCENE_ID },
    user_id: { S: USER_ID },
    attempt_number: { N: "1" },
    status: { S: status },
    worker_token: { S: OLD_TOKEN },
    tier: { S: tier },
    requeue_count: { N: String(requeueCount) },
    train_config: { S: JSON.stringify({ iterations: 15000 }) },
    colmap_config: { S: JSON.stringify({ matcher: "sequential" }) },
  };
  if (cancelRequested) item.cancel_requested = { BOOL: true };
  if (leaseActive) {
    item.lease_status = { S: "ACTIVE" };
    item.lease_expires_at = { S: "2020-01-01T00:00:00.000Z" };
  }
  return item;
}

function sceneRow({ status = "PROCESSING" } = {}) {
  return {
    scene_id: { S: SCENE_ID },
    user_id: { S: USER_ID },
    status: { S: status },
    s3_key: { S: `uploads/${USER_ID}/scene.zip` },
    input_type: { S: "zip" },
    name: { S: "My Scene" },
  };
}

/** One overdue key from the GSI, then no further pages. */
function oneOverdueKey() {
  return { Items: [{ scene_id: { S: ATTEMPT_ID } }], LastEvaluatedKey: undefined };
}

function ofType(name) {
  return sentCommands.filter((c) => c.constructor.name === name);
}
function updates() {
  return ofType("UpdateItemCommand");
}
function sends() {
  return ofType("SendMessageCommand");
}
function parseBody() {
  return JSON.parse(sends()[0].input.MessageBody);
}

let passed = 0;
async function test(name, fn) {
  reset();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  console.log("\nattempts-reap.js — the overdue query");

  await test("queries the sparse lease GSI for expired claims only", async () => {
    responses = [{ Items: [], LastEvaluatedKey: undefined }];

    await attemptsReap.handler({});

    const query = ofType("QueryCommand")[0];
    assert.equal(query.input.IndexName, "lease_status-lease_expires_at-index");
    assert.match(query.input.KeyConditionExpression, /lease_expires_at < :now/);
    assert.equal(query.input.ExpressionAttributeValues[":active"].S, "ACTIVE");
    assert.equal(updates().length, 0, "an empty sweep must write nothing");
  });

  await test("pages through the whole overdue set", async () => {
    responses = [
      { Items: [{ scene_id: { S: ATTEMPT_ID } }], LastEvaluatedKey: { scene_id: { S: "x" } } },
      { Item: attemptRow({ status: "SUCCEEDED", leaseActive: false }) }, // skipped
      { Items: [], LastEvaluatedKey: undefined }, // second page, empty
    ];

    await attemptsReap.handler({});

    assert.equal(ofType("QueryCommand").length, 2, "must follow LastEvaluatedKey");
  });

  console.log("\nattempts-reap.js — what it refuses to touch");

  await test("skips an attempt that already finished", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ status: "SUCCEEDED", leaseActive: false }) },
    ];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).skipped, 1);
    assert.equal(sends().length, 0, "must never re-enqueue completed work");
    assert.equal(updates().length, 0);
  });

  await test("clears a stale lease left on a finished attempt", async () => {
    // Index entries are eventually consistent; a terminal attempt still showing
    // ACTIVE must be dropped from the index rather than reaped.
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ status: "FAILED", leaseActive: true }) },
      {}, // lease release
    ];

    await attemptsReap.handler({});

    assert.equal(sends().length, 0);
    assert.equal(updates().length, 1, "releases the lease only");
    assert.match(updates()[0].input.UpdateExpression, /REMOVE/);
    assert.match(updates()[0].input.UpdateExpression, /#leaseStatus/);
  });

  await test("skips a cancelled attempt — cancellation beats recovery", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ cancelRequested: true }) },
      {}, // lease release
    ];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).skipped, 1);
    assert.equal(sends().length, 0, "must not resurrect work the user stopped");
  });

  await test("skips when the parent scene was cancelled", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow() },
      { Item: sceneRow({ status: "CANCELLED" }) },
      {}, // lease release
    ];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).skipped, 1);
    assert.equal(sends().length, 0);
  });

  await test("skips when the attempt row was deleted", async () => {
    responses = [oneOverdueKey(), { Item: undefined }];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).skipped, 1);
    assert.equal(updates().length, 0);
  });

  await test("skips when the parent scene was deleted", async () => {
    responses = [oneOverdueKey(), { Item: attemptRow() }, { Item: undefined }];

    const res = await attemptsReap.handler({});
    assert.equal(JSON.parse(res.body).skipped, 1);
    assert.equal(sends().length, 0);
  });

  console.log("\nattempts-reap.js — recovery");

  await test("requeues: rotates the token, resets to QUEUED, sends a message", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ requeueCount: 1 }) },
      { Item: sceneRow() },
      {}, // attempt update
      {}, // scene cascade
    ];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).requeued, 1);

    const attemptUpdate = updates()[0];
    const vals = attemptUpdate.input.ExpressionAttributeValues;
    assert.equal(vals[":queued"].S, "QUEUED");
    assert.equal(vals[":rc"].N, "2", "requeue_count increments");
    assert.equal(vals[":reason"].S, "LEASE_EXPIRED");
    assert.notEqual(
      vals[":token"].S,
      OLD_TOKEN,
      "worker_token must rotate — this is the fence that locks out a live worker",
    );
    assert.match(
      attemptUpdate.input.UpdateExpression,
      /REMOVE/,
      "lease must be released or the next sweep reaps it again",
    );
    assert.equal(
      attemptUpdate.input.ConditionExpression,
      "#s = :processing",
      "a worker reporting in mid-sweep must make this a no-op",
    );
  });

  await test("enqueues a message the worker can actually parse", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ requeueCount: 1 }) },
      { Item: sceneRow() },
      {},
      {},
    ];

    await attemptsReap.handler({});

    const body = parseBody();
    // worker.py's parse_message_body() rejects a message missing attemptId or
    // apiAuthToken, and a rejected message DLQs after three receives with no
    // training run — so these two matter most.
    assert.equal(body.attemptId, ATTEMPT_ID);
    assert.ok(body.apiAuthToken, "must carry the rotated token");
    assert.equal(body.sceneId, SCENE_ID);
    assert.equal(body.inputPrefix, `uploads/${USER_ID}/scene.zip`);
    assert.equal(
      body.outputPrefix,
      `uploads/${USER_ID}/scene.zip/output/attempt-${ATTEMPT_ID}/`,
      "attempt-scoped, so an overlapping worker cannot interleave output",
    );
    assert.deepEqual(body.trainConfig, { iterations: 15000 });
    assert.deepEqual(body.colmapConfig, { matcher: "sequential" });
    assert.equal(body.requeueCount, 2);
    assert.equal(body.maxRequeues, 5);
  });

  await test("sends the token rotated onto the row, not the old one", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow() },
      { Item: sceneRow() },
      {},
      {},
    ];

    await attemptsReap.handler({});

    // If these diverged, the recovered worker would 403 on its opening PATCH
    // and the job would be dropped as poison.
    assert.equal(
      parseBody().apiAuthToken,
      updates()[0].input.ExpressionAttributeValues[":token"].S,
    );
  });

  await test("routes a paid-tier attempt to the priority queue", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ tier: "pro" }) },
      { Item: sceneRow() },
      {},
      {},
    ];

    await attemptsReap.handler({});

    assert.equal(sends()[0].input.QueueUrl, "https://sqs.test/priority");
  });

  await test("cascades QUEUED to the scene without overwriting a cancel", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow() },
      { Item: sceneRow() },
      {},
      {},
    ];

    await attemptsReap.handler({});

    const cascade = updates()[1];
    assert.equal(cascade.input.Key.scene_id.S, SCENE_ID);
    assert.equal(cascade.input.ExpressionAttributeValues[":status"].S, "QUEUED");
    assert.match(cascade.input.ConditionExpression, /#s <> :cancelled/);
  });

  await test("no-ops when a worker reports in between query and write", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow() },
      { Item: sceneRow() },
      new ConditionalCheckFailedException(), // attempt is no longer PROCESSING
    ];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).skipped, 1);
    assert.equal(sends().length, 0, "must not enqueue after losing the race");
  });

  console.log("\nattempts-reap.js — the requeue cap");

  await test("fails terminally once the cap is reached", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ requeueCount: 5 }) }, // == MAX_REQUEUES
      {}, // attempt update
      {}, // scene cascade
    ];

    const res = await attemptsReap.handler({});

    assert.equal(JSON.parse(res.body).failed, 1);
    assert.equal(sends().length, 0, "an interruption loop must terminate");

    const vals = updates()[0].input.ExpressionAttributeValues;
    assert.equal(vals[":failed"].S, "FAILED");
    assert.equal(vals[":reason"].S, "LEASE_EXPIRED");
    assert.match(updates()[0].input.UpdateExpression, /REMOVE/, "lease released");
    assert.equal(updates()[1].input.ExpressionAttributeValues[":status"].S, "FAILED");
  });

  await test("still requeues one below the cap", async () => {
    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ requeueCount: 4 }) },
      { Item: sceneRow() },
      {},
      {},
    ];

    const res = await attemptsReap.handler({});
    assert.equal(JSON.parse(res.body).requeued, 1);
    assert.equal(parseBody().requeueCount, 5);
  });

  console.log("\nattempts-reap.js — resilience");

  await test("one bad attempt does not abort the sweep", async () => {
    responses = [
      {
        Items: [{ scene_id: { S: ATTEMPT_ID } }, { scene_id: { S: ATTEMPT_ID } }],
        LastEvaluatedKey: undefined,
      },
      new Error("transient DynamoDB failure"), // first attempt's GetItem
      { Item: attemptRow({ status: "SUCCEEDED", leaseActive: false }) }, // second is fine
    ];

    const res = await attemptsReap.handler({});
    const stats = JSON.parse(res.body);

    assert.equal(stats.errors, 1);
    assert.equal(stats.skipped, 1, "the rest of the overdue set still gets processed");
  });

  console.log("\nattempts-reap.js — dry run");

  await test("dry run writes nothing and enqueues nothing", async () => {
    // Re-require with the flag on. attempts-reap.js reads DRY_RUN at module
    // load, so the cached instance has to be dropped.
    delete require.cache[require.resolve("../handlers/attempts-reap")];
    process.env.ATTEMPT_REAPER_DRY_RUN = "true";
    const dryReaper = require("../handlers/attempts-reap");

    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ requeueCount: 1 }) },
      { Item: sceneRow() },
    ];

    const res = await dryReaper.handler({});
    const stats = JSON.parse(res.body);

    assert.equal(stats.dryRun, true);
    assert.equal(stats.requeued, 1, "still reports what it would have done");
    assert.equal(updates().length, 0, "no writes");
    assert.equal(sends().length, 0, "no messages");

    delete require.cache[require.resolve("../handlers/attempts-reap")];
    process.env.ATTEMPT_REAPER_DRY_RUN = "false";
  });

  await test("dry run does not even release a stale lease", async () => {
    // Regression: the stale-lease release in the non-PROCESSING branch
    // originally bypassed the dry-run guard, so an observe-only sweep still
    // wrote. "Writes nothing" has to mean nothing.
    delete require.cache[require.resolve("../handlers/attempts-reap")];
    process.env.ATTEMPT_REAPER_DRY_RUN = "true";
    const dryReaper = require("../handlers/attempts-reap");

    responses = [
      oneOverdueKey(),
      { Item: attemptRow({ status: "SUCCEEDED", leaseActive: true }) },
    ];

    await dryReaper.handler({});
    assert.equal(updates().length, 0, "no writes at all in dry run");

    delete require.cache[require.resolve("../handlers/attempts-reap")];
    process.env.ATTEMPT_REAPER_DRY_RUN = "false";
  });

  await test("dry run defaults on when the flag is absent entirely", async () => {
    // An unset or misspelled value must leave the reaper observe-only: it arms
    // only on the exact string "false".
    delete require.cache[require.resolve("../handlers/attempts-reap")];
    const saved = process.env.ATTEMPT_REAPER_DRY_RUN;
    delete process.env.ATTEMPT_REAPER_DRY_RUN;
    const defaultReaper = require("../handlers/attempts-reap");

    responses = [oneOverdueKey(), { Item: attemptRow({ requeueCount: 5 }) }];

    const res = await defaultReaper.handler({});

    assert.equal(JSON.parse(res.body).dryRun, true, "must fail safe");
    assert.equal(updates().length, 0);

    process.env.ATTEMPT_REAPER_DRY_RUN = saved;
    delete require.cache[require.resolve("../handlers/attempts-reap")];
  });

  console.log(`\n${passed} assertions passed\n`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
