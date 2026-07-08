"use strict";

/**
 * node backend/test/account-status.test.js
 */

const assert = require("node:assert/strict");
const { blockReasonForNewWork, ACCOUNT_STATUSES, DEFAULT_STATUS } = require("../lib/account-status");

assert.equal(DEFAULT_STATUS, "ACTIVE");
assert.deepEqual(
  ACCOUNT_STATUSES,
  ["ACTIVE", "SUSPENDED", "BANNED", "SOFT_DELETED", "HARD_DELETED"]
);

// Active accounts are never blocked from new work.
assert.equal(blockReasonForNewWork("ACTIVE"), null);

// Every restricted status blocks new job submission / upload with a
// user-facing message (submit-job.js / init.js / upload-from-gdrive.js all
// surface this string directly in the 403 body).
for (const status of ["SUSPENDED", "BANNED", "SOFT_DELETED", "HARD_DELETED"]) {
  const reason = blockReasonForNewWork(status);
  assert.equal(typeof reason, "string");
  assert.ok(reason.length > 0, `${status} should produce a non-empty block reason`);
}

console.log("account-status.test.js: all assertions passed");
