"use strict";

/**
 * Parity test for the manual worker-boot user_data.
 *
 *   node backend/test/worker-boot-userdata.test.js
 *
 * ## The bug this exists to prevent
 *
 * admin-worker-ami-boot.js documents itself as building "the same env-file the
 * Terraform-managed launch template injects ... so a manually booted instance
 * behaves identically to a real ASG worker". It had drifted: the handler wrote
 * QUEUE_NAME and DLQ_NAME but not SQS_QUEUE_URL, DLQURL, AWS_REGION or RUN_ENV.
 *
 * A manually booted worker therefore came up with an empty QURL:
 *
 *     │ QURL   :        │
 *     │ DLQURL : (none) │
 *     "No Queue URL found. Check QUEUE_NAME, SQS_QUEUE_URL, or AWS credentials."
 *
 * and exited before polling — after paying to boot a GPU instance.
 *
 * The injected URL matters more than it appears. worker.py's
 * resolve_queue_urls() prefers it and only falls back to sqs:GetQueueUrl by
 * name, which needs working credentials. Instance-profile credentials take a
 * few seconds to surface in IMDS after RunInstances, so a worker can read
 * metadata (instance id, region, lifecycle) while credential lookups still
 * 404 — which is exactly what the failing instance logged. Injecting the URL
 * removes that dependency entirely.
 *
 * ## Why it reads Terraform
 *
 * Asserting a hardcoded list here would drift the same way. Instead this parses
 * the ENVFILE heredoc out of compute.tf and compares key sets, so adding a key
 * to the launch template without adding it to the handler fails the build.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const COMPUTE_TF = path.join(
  __dirname,
  "..",
  "..",
  "infra",
  "modules",
  "static-site",
  "compute.tf",
);

/**
 * Extract the KEY names between `cat > /etc/splatial-worker.env <<'ENVFILE'`
 * and its terminator.
 *
 * Line-based on purpose: the opener contains the string "ENVFILE" too, so a
 * naive indexOf for the terminator matches the opener and yields nothing.
 * In compute.tf the terminator is also indented, hence the trim.
 */
function envKeysFromHeredoc(text, source) {
  const lines = text.split("\n");
  const startIdx = lines.findIndex((l) =>
    l.includes("cat > /etc/splatial-worker.env <<'ENVFILE'"),
  );
  assert.notEqual(startIdx, -1, `could not find the ENVFILE heredoc in ${source}`);

  const keys = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "ENVFILE") return keys;
    if (line.includes("=")) keys.push(line.split("=")[0].trim());
  }
  assert.fail(`unterminated ENVFILE heredoc in ${source}`);
}

function launchTemplateEnvKeys() {
  return envKeysFromHeredoc(fs.readFileSync(COMPUTE_TF, "utf8"), "compute.tf");
}

/** Decode buildUserData() and pull the KEY names out of its heredoc. */
function handlerEnvKeys(userDataBase64) {
  return envKeysFromHeredoc(
    Buffer.from(userDataBase64, "base64").toString("utf8"),
    "handler user_data",
  );
}

function decode(userDataBase64) {
  return Buffer.from(userDataBase64, "base64").toString("utf8");
}

// Values the Lambda would really have (see lambda-upload.tf).
process.env.WORKER_QUEUE_NAME = "splatial-dev-splat-processing-queue";
process.env.WORKER_DLQ_NAME = "splatial-dev-splat-processing-dlq";
process.env.SQS_QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/111122223333/splatial-dev-splat-processing-queue";
process.env.WORKER_DLQ_URL =
  "https://sqs.us-east-1.amazonaws.com/111122223333/splatial-dev-splat-processing-dlq";
process.env.AWS_REGION = "us-east-1";
process.env.SPLATIAL_ENV = "dev";
process.env.WORKER_LOG_GROUP = "/splatial/dev/worker";

const { buildUserData } = require("../handlers/admin-worker-ami-boot");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("\nadmin-worker-ami-boot.js — launch-template parity");

test("emits every env key the launch template writes", () => {
  const expected = launchTemplateEnvKeys();
  const actual = handlerEnvKeys(buildUserData());

  assert.ok(expected.length >= 8, `sanity: parsed only ${expected.length} keys from compute.tf`);

  const missing = expected.filter((k) => !actual.includes(k));
  assert.deepEqual(
    missing,
    [],
    `manual boot would omit: ${missing.join(", ")} — a booted worker will not match an ASG worker`,
  );
});

test("specifically injects the queue URLs (the reported failure)", () => {
  const keys = handlerEnvKeys(buildUserData());
  assert.ok(keys.includes("SQS_QUEUE_URL"), "empty QURL without this");
  assert.ok(keys.includes("DLQURL"), "DLQURL showed as (none) without this");
});

test("injects the real queue URL values, not empty strings", () => {
  const script = decode(buildUserData());
  assert.match(script, /SQS_QUEUE_URL=https:\/\/sqs\.[^\s]+/);
  assert.match(script, /DLQURL=https:\/\/sqs\.[^\s]+/);
});

test("sets RUN_ENV=ec2 so boto3 uses the instance role", () => {
  // Without it, aws_config.get_session() can fall through to looking for a
  // local AWS_PROFILE that does not exist on the instance.
  assert.match(decode(buildUserData()), /^RUN_ENV=ec2$/m);
});

test("sets AWS_REGION", () => {
  assert.match(decode(buildUserData()), /^AWS_REGION=us-east-1$/m);
});

console.log("\nadmin-worker-ami-boot.js — service start");

test("restarts rather than starts the unit", () => {
  // The AMI may already have the unit enabled, in which case it ran at boot
  // before this env file existed and has since exited. restart is unambiguous.
  const script = decode(buildUserData());
  assert.match(script, /systemctl restart gaussian-worker\.service/);
});

test("still writes the systemd EnvironmentFile drop-in", () => {
  const script = decode(buildUserData());
  assert.match(script, /EnvironmentFile=\/etc\/splatial-worker\.env/);
  assert.match(script, /systemctl daemon-reload/);
});

console.log("\nadmin-worker-ami-boot.js — degraded config");

test("emits empty values rather than the literal 'undefined'", () => {
  // "undefined" in an env file is worse than empty: worker.py's DEFAULTS would
  // not fill it in, and the value would look deliberately set.
  const saved = process.env.WORKER_LOG_GROUP;
  delete process.env.WORKER_LOG_GROUP;
  try {
    const script = decode(buildUserData());
    assert.doesNotMatch(script, /=undefined$/m);
  } finally {
    process.env.WORKER_LOG_GROUP = saved;
  }
});

console.log(`\n${passed} assertions passed\n`);
