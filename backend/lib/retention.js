"use strict";

/**
 * Raw-source retention: N days after a scene's most recent successful
 * training completion, its raw input (images/video) is deleted — the
 * generated output (.splat/.ply) is never touched by retention. `null` means
 * never expires.
 *
 * Deliberately NOT implemented via DynamoDB TTL: TTL only deletes the
 * DynamoDB row, never the S3 objects it points to, which would orphan raw
 * source in S3 forever while the metadata silently vanished. See
 * backend/handlers/retention-sweep.js (EventBridge-scheduled) for the actual
 * deletion path, and attempt-patch.js for where raw_expires_at gets set.
 */
const RETENTION_DAYS = Object.freeze({
  free: 30,
  pro: null,
});

const DEFAULT_TIER = "free";

/**
 * ISO timestamp for when a tier's raw-retention window elapses from `from`
 * (default now), or null if that tier's raw source never expires. Recomputed
 * (not incremented) on every successful completion, so a scene's window
 * always measures from its most recent successful run, not its first.
 */
function computeRawExpiresAt(tier, from = new Date()) {
  const days = RETENTION_DAYS[tier] ?? RETENTION_DAYS[DEFAULT_TIER];
  if (days === null) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = { RETENTION_DAYS, computeRawExpiresAt };
