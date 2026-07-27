"use strict";

/**
 * Lightweight assertion-based tests for the cancellation lifecycle — no test
 * framework is configured in this package (see CLAUDE.md §4), so these run
 * directly under plain Node:
 *
 *   node backend/test/cancel-lifecycle.test.js
 *
 * DynamoDBClient.prototype.send is monkey-patched with a queue of canned
 * responses, matching the pattern in comment-delete.test.js.
 *
 * These are the regression tests for the bug fixed here: cancellation was
 * advisory only. attempt-patch.js short-circuited a CANCELLED attempt with
 * HTTP *200*, and worker.py computes `ok = 200 <= status_code < 300`, so the
 * worker read the skip as success and went on to run a full COLMAP + 3DGS
 * job on a cancelled scene. Separately, the parent-scene cascade carried no
 * ConditionExpression, so a still-running worker's next PATCH would flip a
 * CANCELLED scene back to PROCESSING/READY/FAILED.
 *
 * The two invariants under test:
 *   1. A CANCELLED attempt answers 4xx, never 2xx.
 *   2. No worker write can move a CANCELLED attempt or scene out of that state.
 */

const assert = require("node:assert/strict");

process.env.SCENES_TABLE_NAME = "test-scenes";
process.env.PROFILES_TABLE_NAME = "test-profiles";
process.env.SPLAT_SCENES_BUCKET_NAME = "test-output-bucket";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");

const sentCommands = [];
let responses = [];

// attempt-patch.js measures output size on SUCCEEDED. Stubbed so the sizing
// call resolves quietly instead of warning about a missing AWS connection.
S3Client.prototype.send = async function send() {
  return { Contents: [], KeyCount: 0, ContentLength: 0 };
};

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

const attemptPatch = require("../handlers/attempt-patch");
const attemptHeartbeat = require("../handlers/attempt-heartbeat");

const ATTEMPT_ID = "3f8a1c22-9b41-4a0e-8d77-2e5c9f0b1a34";
const SCENE_ID = "b5e75d62-515c-4fc6-aed7-56f8e6fb72c1";
const USER_ID = "u-1";
const TOKEN = "worker-token-abc";

function reset() {
  sentCommands.length = 0;
  responses = [];
}

function patchEvent(body) {
  return {
    pathParameters: { attemptId: ATTEMPT_ID },
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  };
}

function attemptItem({ status, cancelRequested = false }) {
  const item = {
    scene_id: { S: ATTEMPT_ID },
    record_type: { S: "attempt" },
    parent_scene_id: { S: SCENE_ID },
    user_id: { S: USER_ID },
    worker_token: { S: TOKEN },
    status: { S: status },
    tier: { S: "free" },
    // Present so the notification path does not need a second GetItem for the
    // scene name — keeps the canned response queues in these tests short.
    name: { S: "My Scene" },
  };
  if (cancelRequested) item.cancel_requested = { BOOL: true };
  return item;
}

function commandsOfType(name) {
  return sentCommands.filter((c) => c.constructor.name === name);
}

let passed = 0;
async function test(name, fn) {
  reset();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  console.log("\nattempt-patch.js — CANCELLED is terminal");

  // The core regression. Every one of these used to be reachable; only
  // RUNNING was guarded, and even that returned 200.
  for (const status of ["RUNNING", "SUCCEEDED", "FAILED", "INTERRUPTED"]) {
    await test(`rejects ${status} on a CANCELLED attempt with 409`, async () => {
      responses = [{ Item: attemptItem({ status: "CANCELLED" }) }];

      const res = await attemptPatch.handler(patchEvent({ status }));
      const body = JSON.parse(res.body);

      assert.equal(res.statusCode, 409, "must be 4xx — worker treats 2xx as success");
      assert.equal(body.reason, "CANCELLED");
      assert.equal(body.cancelRequested, true, "worker reads this to stop");
      assert.equal(
        commandsOfType("UpdateItemCommand").length,
        0,
        "must not write anything for a cancelled attempt",
      );
    });
  }

  await test("allows CANCELLED -> CANCELLED as an idempotent re-assert", async () => {
    responses = [
      { Item: attemptItem({ status: "CANCELLED" }) },
      {}, // attempt update
      {}, // parent cascade
    ];

    const res = await attemptPatch.handler(
      patchEvent({ status: "CANCELLED", progressPhase: "TRAINING", progressPercent: 40 }),
    );

    assert.equal(res.statusCode, 200, "a worker acknowledging its own stop must not 409");
    const updates = commandsOfType("UpdateItemCommand");
    assert.equal(updates.length, 2, "attempt + parent scene");
    // The idempotent path must NOT carry the <> CANCELLED guard, or it would
    // fail its own condition and 409 in a loop.
    assert.ok(
      !updates[0].input.ConditionExpression.includes("<> :cancelledGuard"),
      "re-asserting CANCELLED must be exempt from the cancelled guard",
    );
  });

  // FAILED is used for the guard cases below: the guard logic is
  // status-independent, and FAILED avoids the SUCCEEDED path's extra quota
  // write, S3 output sizing and parent output_size_bytes read.
  await test("guards the attempt write against a cancel landing mid-request", async () => {
    // attempt read, attempt update, scene cascade, profile lookup (no email addr)
    responses = [{ Item: attemptItem({ status: "RUNNING" }) }, {}, {}, { Item: {} }];

    await attemptPatch.handler(patchEvent({ status: "FAILED", reason: "WORKER_ERROR" }));

    const attemptUpdate = commandsOfType("UpdateItemCommand")[0];
    assert.ok(
      attemptUpdate.input.ConditionExpression.includes("#s <> :cancelledGuard"),
      "read-then-write must be guarded (cancel-job.js can land between them)",
    );
    assert.equal(
      attemptUpdate.input.ExpressionAttributeValues[":cancelledGuard"].S,
      "CANCELLED",
    );
  });

  await test("returns 409 when it loses the cancel race on the attempt write", async () => {
    responses = [
      { Item: attemptItem({ status: "RUNNING" }) },
      new ConditionalCheckFailedException(),
    ];

    const res = await attemptPatch.handler(patchEvent({ status: "FAILED", reason: "WORKER_ERROR" }));
    const body = JSON.parse(res.body);

    assert.equal(res.statusCode, 409, "same answer regardless of which side of the race we land on");
    assert.equal(body.cancelRequested, true);
  });

  console.log("\nattempt-patch.js — parent scene cascade");

  await test("guards the scene cascade so a worker cannot resurrect a cancelled scene", async () => {
    responses = [{ Item: attemptItem({ status: "RUNNING" }) }, {}, {}, { Item: {} }];

    await attemptPatch.handler(patchEvent({ status: "FAILED", reason: "WORKER_ERROR" }));

    const cascade = commandsOfType("UpdateItemCommand")[1];
    assert.equal(cascade.input.Key.scene_id.S, SCENE_ID);
    assert.ok(
      cascade.input.ConditionExpression.includes("#s <> :cancelledGuard"),
      "the missing condition here is why cancellation did not stick",
    );
  });

  await test("swallows a skipped cascade and reports sceneUpdated=false", async () => {
    responses = [
      { Item: attemptItem({ status: "RUNNING" }) },
      {}, // attempt update succeeds
      new ConditionalCheckFailedException(), // scene is CANCELLED
    ];

    const res = await attemptPatch.handler(patchEvent({ status: "FAILED", reason: "WORKER_ERROR" }));
    const body = JSON.parse(res.body);

    assert.equal(res.statusCode, 200, "a skipped cascade is not a server error");
    assert.equal(body.sceneUpdated, false);
  });

  await test("does not email the owner when the cascade was skipped", async () => {
    responses = [
      { Item: attemptItem({ status: "RUNNING" }) },
      {},
      new ConditionalCheckFailedException(), // scene cancelled
    ];

    // FAILED normally emails the owner ("your scene failed"). With the scene
    // already cancelled, that mail would be noise about work the user stopped.
    await attemptPatch.handler(patchEvent({ status: "FAILED", reason: "WORKER_ERROR" }));

    // The notification block needs a profile GetItem when the attempt row has
    // no name; the canned queue is empty, so any mail attempt would throw
    // "no canned response queued". Getting here means none was made.
    assert.equal(
      commandsOfType("GetItemCommand").length,
      1,
      "only the initial attempt read — no profile lookup for a cancelled scene",
    );
  });

  await test("still emails the owner on a normal FAILED with a healthy scene", async () => {
    responses = [
      { Item: attemptItem({ status: "RUNNING" }) },
      {}, // attempt update
      {}, // parent cascade succeeds
      { Item: {} }, // profile lookup -> no email address, so nothing is sent
    ];

    await attemptPatch.handler(patchEvent({ status: "FAILED", reason: "WORKER_ERROR" }));

    // Proves the guard above is specific to a skipped cascade and has not
    // silently disabled notifications for everyone.
    assert.equal(
      commandsOfType("GetItemCommand").length,
      2,
      "attempt read + profile read — the notification path still runs",
    );
  });

  console.log("\nattempt-heartbeat.js — cancel delivery channel");

  function heartbeatEvent(body) {
    return {
      pathParameters: { attemptId: ATTEMPT_ID },
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    };
  }

  await test("returns cancelRequested=true for a CANCELLED attempt", async () => {
    responses = [{ Item: attemptItem({ status: "CANCELLED" }) }];

    const res = await attemptHeartbeat.handler(
      heartbeatEvent({ progressPhase: "TRAINING", progressPercent: 55 }),
    );
    const body = JSON.parse(res.body);

    assert.equal(res.statusCode, 200, "heartbeat stays 200 — the signal is in the body");
    assert.equal(body.cancelRequested, true);
    assert.equal(
      commandsOfType("UpdateItemCommand").length,
      0,
      "must not record progress for a cancelled attempt",
    );
  });

  await test("returns cancelRequested=true when only cancel_requested is set", async () => {
    responses = [{ Item: attemptItem({ status: "PROCESSING", cancelRequested: true }) }];

    const res = await attemptHeartbeat.handler(heartbeatEvent({ progressPhase: "TRAINING" }));
    assert.equal(JSON.parse(res.body).cancelRequested, true);
  });

  await test("returns cancelRequested=false for a healthy attempt", async () => {
    responses = [
      { Item: attemptItem({ status: "PROCESSING" }) },
      {}, // attempt update
      {}, // parent cascade
    ];

    const res = await attemptHeartbeat.handler(
      heartbeatEvent({ progressPhase: "TRAINING", progressPercent: 55 }),
    );
    const body = JSON.parse(res.body);

    assert.equal(body.received, true);
    assert.equal(body.cancelRequested, false);
    assert.equal(commandsOfType("UpdateItemCommand").length, 2, "attempt + scene progress");
  });

  await test("guards its scene cascade too", async () => {
    responses = [{ Item: attemptItem({ status: "PROCESSING" }) }, {}, {}];

    await attemptHeartbeat.handler(
      heartbeatEvent({ progressPhase: "TRAINING", progressPercent: 55 }),
    );

    const cascade = commandsOfType("UpdateItemCommand")[1];
    assert.ok(
      cascade.input.ConditionExpression.includes("#st <> :cancelled"),
      "progress writes must not keep a cancelled scene looking alive",
    );
  });

  await test("tolerates a cancelled scene during the progress cascade", async () => {
    responses = [
      { Item: attemptItem({ status: "PROCESSING" }) },
      {},
      new ConditionalCheckFailedException(),
    ];

    const res = await attemptHeartbeat.handler(
      heartbeatEvent({ progressPhase: "TRAINING", progressPercent: 55 }),
    );
    assert.equal(res.statusCode, 200, "must not 500 when the scene was cancelled");
  });

  console.log("\nlease lifecycle — the sparse GSI contract");

  // The invariant: an attempt in a state where no worker is running must not
  // carry lease_status, or the reaper re-enqueues finished work.
  await test("RUNNING claims a lease", async () => {
    responses = [{ Item: attemptItem({ status: "QUEUED" }) }, {}, {}];

    await attemptPatch.handler(patchEvent({ status: "RUNNING", progressPhase: "INIT" }));

    const update = commandsOfType("UpdateItemCommand")[0];
    assert.match(update.input.UpdateExpression, /#leaseStatus = :leaseActive/);
    assert.equal(update.input.ExpressionAttributeValues[":leaseActive"].S, "ACTIVE");
    assert.ok(
      update.input.ExpressionAttributeValues[":leaseExpiry"].S > new Date().toISOString(),
      "lease must expire in the future",
    );
    assert.doesNotMatch(update.input.UpdateExpression, /REMOVE/);
  });

  for (const [workerStatus, why] of [
    ["SUCCEEDED", "finished work must not be reaped"],
    ["FAILED", "failed work must not be reaped"],
    ["INTERRUPTED", "the worker re-enqueued it itself, so it needs no recovery"],
  ]) {
    await test(`${workerStatus} releases the lease — ${why}`, async () => {
      // SUCCEEDED is the longest path (quota event, output sizing, parent
      // output_size_bytes read, storage delta, then the notification lookup),
      // so the queue is sized for it. The assertions below read
      // UpdateItemCommand[0], which is the attempt write in every case.
      responses = [
        { Item: attemptItem({ status: "PROCESSING" }) }, // attempt read
        {}, // quota event PutItem   (SUCCEEDED only)
        {}, // attempt UpdateItem
        { Item: { output_size_bytes: { N: "0" } } }, // parent read (SUCCEEDED only)
        {}, // parent UpdateItem
        {}, // storage delta        (SUCCEEDED only)
        { Item: {} }, // profile read -> no email address, nothing sent
      ];

      await attemptPatch.handler(
        patchEvent({ status: workerStatus, reason: "WORKER_ERROR" }),
      );

      const update = commandsOfType("UpdateItemCommand")[0];
      assert.match(update.input.UpdateExpression, /REMOVE .*#leaseStatus/);
      assert.match(update.input.UpdateExpression, /lease_expires_at/);
      assert.doesNotMatch(
        update.input.UpdateExpression,
        /#leaseStatus = :leaseActive/,
        "must not claim and release in the same write",
      );
    });
  }

  await test("a heartbeat renews the lease", async () => {
    responses = [{ Item: attemptItem({ status: "PROCESSING" }) }, {}, {}];

    await attemptHeartbeat.handler(
      heartbeatEvent({ progressPhase: "TRAINING", progressPercent: 40 }),
    );

    const update = commandsOfType("UpdateItemCommand")[0];
    assert.match(update.input.UpdateExpression, /#leaseStatus = :leaseActive/);
    assert.match(
      update.input.UpdateExpression,
      /last_heartbeat_at = :now/,
      "last_heartbeat_at finally has a consumer",
    );
  });

  await test("a heartbeat only renews while the attempt is PROCESSING", async () => {
    responses = [{ Item: attemptItem({ status: "PROCESSING" }) }, {}, {}];

    await attemptHeartbeat.handler(heartbeatEvent({ progressPhase: "TRAINING" }));

    const update = commandsOfType("UpdateItemCommand")[0];
    assert.match(update.input.ConditionExpression, /#s = :processing/);
  });

  await test("a fenced-out worker gets leaseLost, not cancelRequested", async () => {
    responses = [
      { Item: attemptItem({ status: "PROCESSING" }) },
      new ConditionalCheckFailedException(), // reaper already requeued it
    ];

    const res = await attemptHeartbeat.handler(
      heartbeatEvent({ progressPhase: "TRAINING", progressPercent: 40 }),
    );
    const body = JSON.parse(res.body);

    assert.equal(res.statusCode, 409);
    assert.equal(body.reason, "LEASE_LOST");
    assert.equal(body.leaseLost, true);
    // Critical distinction: a cancelled worker PATCHes CANCELLED on the way
    // out, which here would mark terminal an attempt the reaper has already
    // handed to a replacement — destroying a live run.
    assert.equal(
      body.cancelRequested,
      false,
      "lease loss must not be reported as cancellation",
    );
  });

  console.log(`\n${passed} assertions passed\n`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
