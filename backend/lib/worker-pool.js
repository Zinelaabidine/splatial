"use strict";

/**
 * Two GPU worker pools, each backed by its own SQS queue + ASG + launch
 * template (see infra/modules/static-site/compute-priority.tf):
 *
 *   - "standard": the original pool (free tier). 100% Spot
 *     (mixed_instances_policy.on_demand_percentage_above_base_capacity = 0
 *     in compute.tf) — unchanged from before this pool split existed.
 *   - "priority": paid tier. 100% On-Demand
 *     (on_demand_percentage_above_base_capacity = 100 in
 *     compute-priority.tf) — never receives Spot interruption notices, so
 *     worker.py's checkpoint/requeue logic simply never fires there.
 *
 * A job is never reordered within a shared queue to get "priority" — it's
 * routed to an entirely separate queue + ASG, so paid-tier jobs are never
 * waiting behind free-tier jobs in the first place.
 */

const POOLS = new Set(["standard", "priority"]);
const DEFAULT_POOL = "standard";

/** Which pool a given subscription tier's jobs run on. */
const TIER_POOL = Object.freeze({
  free: "standard",
  pro: "priority",
});

/** Resolve a raw (possibly missing/invalid) pool value to a known pool. */
function resolvePool(raw) {
  const pool = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return POOLS.has(pool) ? pool : DEFAULT_POOL;
}

/** Which pool a tier's jobs should be routed to. Unknown tiers get the default pool. */
function getPoolForTier(tier) {
  return TIER_POOL[tier] ?? DEFAULT_POOL;
}

/**
 * Resolve the env-var config for a pool. "standard" reads the original
 * unsuffixed env vars (unchanged); "priority" reads the _PRIORITY-suffixed
 * ones added alongside compute-priority.tf.
 */
function getPoolConfig(pool) {
  if (pool === "priority") {
    return {
      pool: "priority",
      asgName: process.env.WORKER_ASG_NAME_PRIORITY,
      launchTemplateId: process.env.WORKER_LAUNCH_TEMPLATE_ID_PRIORITY,
      maxSizeCap: Number(process.env.WORKER_ASG_MAX_SIZE_CAP_PRIORITY || 3),
      queueUrl: process.env.SQS_QUEUE_URL_PRIORITY,
    };
  }
  return {
    pool: "standard",
    asgName: process.env.WORKER_ASG_NAME,
    launchTemplateId: process.env.WORKER_LAUNCH_TEMPLATE_ID,
    maxSizeCap: Number(process.env.WORKER_ASG_MAX_SIZE_CAP || 5),
    queueUrl: process.env.SQS_QUEUE_URL,
  };
}

module.exports = { resolvePool, getPoolForTier, getPoolConfig, POOLS, DEFAULT_POOL, TIER_POOL };
