"use strict";

/**
 * Lease bookkeeping for training attempts — the mechanism that makes a crashed
 * worker recoverable.
 *
 * ## Why a lease and not just SQS
 *
 * SQS already redelivers a message whose visibility timeout lapses, so a dead
 * worker's job does eventually come back. Two gaps that does not cover:
 *
 *   1. The scenes table keeps saying PROCESSING. Nothing reconciles the record,
 *      so the dashboard shows a job that no longer exists anywhere.
 *   2. maxReceiveCount is 3 (sqs.tf). Once exhausted the message moves to the
 *      DLQ, which has no redrive-back configured — the attempt is then stuck
 *      forever with no message and no worker.
 *
 * A lease gives us a queryable "this attempt claims to be running, and that
 * claim is stale" signal that survives both, and it is the only signal a hard
 * crash can produce, because a hard-crashed worker sends no PATCH at all.
 *
 * ## Sparse-GSI contract — read this before changing a status transition
 *
 * lease_status is written as "ACTIVE" *only* while a worker holds a claim, and
 * REMOVEd on every exit. It is the hash key of
 * lease_status-lease_expires_at-index (dynamodb.tf), so the index contains
 * exactly the set of live claims and the reaper can Query "everything overdue"
 * instead of scanning the table. Same sparse-index technique as
 * raw_retention_status-raw_expires_at-index, which retention-sweep.js uses.
 *
 * The invariant that matters: **an attempt in a state where no worker is
 * running must not carry lease_status.** Leaving it behind on a terminal status
 * means the reaper re-enqueues finished work. Hence clearLeaseFields() is
 * applied for SUCCEEDED, FAILED, CANCELLED and INTERRUPTED alike — the last of
 * those because the worker re-enqueues the job itself, so it is QUEUED with a
 * live message and needs no recovery.
 *
 * A QUEUED attempt likewise holds no lease: it has a real SQS message backing
 * it, and leasing it would make the reaper duplicate messages for jobs that are
 * merely waiting for the ASG to scale out.
 */

/**
 * How long a claim stays valid without a heartbeat.
 *
 * Deliberately generous relative to HEARTBEAT_INTERVAL_SECONDS (30s in
 * worker.py): the cost of expiring too early is duplicate GPU work, while the
 * cost of expiring late is a few minutes of delayed recovery. A transient API
 * outage or a long unyielding subprocess must not look like a crash.
 */
const LEASE_SECONDS = Number(process.env.ATTEMPT_LEASE_SECONDS || 600);

/**
 * Infrastructure requeues allowed before an attempt is failed outright.
 *
 * Counts Spot interruptions and reaper recoveries, NOT user-visible retries
 * (those are separate attempts). Without a cap, a scene that reliably crashes
 * its worker would be re-enqueued forever.
 */
const MAX_REQUEUES = Number(process.env.ATTEMPT_MAX_REQUEUES || 5);

/** Statuses during which a worker legitimately holds a claim. */
const LEASED_ATTEMPT_STATUSES = new Set(["PROCESSING"]);

function leaseExpiryIso(fromDate = new Date(), leaseSeconds = LEASE_SECONDS) {
  return new Date(fromDate.getTime() + leaseSeconds * 1000).toISOString();
}

/**
 * Append SET clauses that claim or renew a lease.
 *
 * @param {string[]} setParts   accumulating "a = :b" fragments
 * @param {object}   values     accumulating ExpressionAttributeValues
 * @param {object}   names      accumulating ExpressionAttributeNames
 * @param {Date}     [now]
 */
function applyLeaseClaim(setParts, values, names, now = new Date()) {
  setParts.push("#leaseStatus = :leaseActive", "lease_expires_at = :leaseExpiry");
  names["#leaseStatus"] = "lease_status";
  values[":leaseActive"] = { S: "ACTIVE" };
  values[":leaseExpiry"] = { S: leaseExpiryIso(now) };
}

/**
 * Append a REMOVE clause that drops the attempt out of the lease GSI.
 *
 * Returned separately from the SET parts because DynamoDB requires REMOVE to be
 * its own clause in the UpdateExpression.
 *
 * @param {string[]} removeParts accumulating attribute names to remove
 * @param {object}   names       accumulating ExpressionAttributeNames
 */
function applyLeaseRelease(removeParts, names) {
  removeParts.push("#leaseStatus", "lease_expires_at");
  names["#leaseStatus"] = "lease_status";
}

/**
 * Compose a DynamoDB UpdateExpression from SET and REMOVE fragments.
 *
 * Exists because assembling this inline is easy to get subtly wrong — an empty
 * REMOVE clause, or the two clauses in the wrong order, both fail at runtime
 * rather than at review time.
 */
function buildUpdateExpression(setParts, removeParts = []) {
  const clauses = [];
  if (setParts.length > 0) clauses.push("SET " + setParts.join(", "));
  if (removeParts.length > 0) clauses.push("REMOVE " + removeParts.join(", "));
  return clauses.join(" ");
}

/** True when this worker status means a claim is being held. */
function statusHoldsLease(mappedStatus) {
  return LEASED_ATTEMPT_STATUSES.has(mappedStatus);
}

module.exports = {
  LEASE_SECONDS,
  MAX_REQUEUES,
  LEASE_GSI_NAME: "lease_status-lease_expires_at-index",
  leaseExpiryIso,
  applyLeaseClaim,
  applyLeaseRelease,
  buildUpdateExpression,
  statusHoldsLease,
};
