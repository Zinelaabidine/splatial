"use strict";

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getClaims, requirePermission } = require("../lib/rbac");
const { TIER_LIMITS, DEFAULT_TIER } = require("../lib/user-tier");
const { getPoolForTier } = require("../lib/worker-pool");
const { STORAGE_CAP_BYTES } = require("../lib/storage-quota");
const { writeAuditLog } = require("../lib/audit-log");
const { notifyAdmins } = require("../lib/notify");

const dynamo = new DynamoDBClient({});
const USERS_TABLE = process.env.USERS_TABLE_NAME;

/**
 * POST /admin/users/{userId}/plan
 *
 * Changes a user's subscription tier. Enforcement is automatically
 * server-side and immediate: submit-job.js and init.js both call
 * getUserTier() fresh on every request (no caching), so the very next job
 * submission / upload after this call is evaluated against the new tier's
 * quota (lib/user-tier.js), storage cap (lib/storage-quota.js), and worker
 * pool / processing priority (lib/worker-pool.js) — this endpoint does not
 * need to (and does not) duplicate any of that logic.
 *
 * Body: { tier: "free" | "pro", reason: string }
 */
exports.handler = async (event) => {
  const denied = requirePermission(event, "users.manage_plan");
  if (denied) return denied;

  const actorId = getClaims(event)?.sub;
  const targetUserId = event.pathParameters?.userId;
  if (!targetUserId) return response(400, { error: "Missing path parameter: userId" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Malformed JSON body" });
  }

  const tier = typeof body.tier === "string" ? body.tier.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier)) {
    return response(400, { error: `tier must be one of: ${Object.keys(TIER_LIMITS).join(", ")}` });
  }
  if (!reason) return response(400, { error: "A reason is required for this action." });

  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: USERS_TABLE, Key: { user_id: { S: targetUserId } } })
  );
  const currentTier = Item?.tier?.S ?? DEFAULT_TIER;

  if (currentTier === tier) {
    return response(409, { error: `User is already on the ${tier} tier` });
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { user_id: { S: targetUserId } },
      UpdateExpression: "SET tier = :tier",
      ExpressionAttributeValues: { ":tier": { S: tier } },
    })
  );

  await writeAuditLog(dynamo, {
    actorAdminId: actorId,
    targetUserId,
    actionType: "user.plan_change",
    beforeState: { tier: currentTier },
    afterState: { tier },
    reason,
    correlationId: event.requestContext?.requestId,
  });

  await notifyAdmins({
    title: "User plan changed",
    message: `${actorId} changed ${targetUserId}'s plan: ${currentTier} -> ${tier} — ${reason}`,
  });

  return response(200, {
    userId: targetUserId,
    tier,
    quotaLimit: TIER_LIMITS[tier],
    storageCapBytes: STORAGE_CAP_BYTES[tier],
    workerPool: getPoolForTier(tier),
  });
};
