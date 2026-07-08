"use strict";

const { GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { getUserTier } = require("./user-tier");

// Single source of truth for "which tiers may download raw/output assets".
// Keep in sync with pricing-page copy, same convention as TIER_LIMITS in
// lib/user-tier.js.
const PAID_TIERS = new Set(["pro"]);

/**
 * Shared ownership + paid-tier check for scene-download-raw.js and
 * scene-download-output.js.
 *
 * Downloading is a self-service export of your own assets, not a viewing
 * permission — unlike scene-view-url.js (owner OR public), this never
 * extends to a paid user downloading someone else's public scene, and
 * never extends to a free-tier owner downloading their own. Returns
 * either `{ ok: true, item, tier }` or `{ ok: false, statusCode, body }`
 * ready to hand straight to lib/response.js.
 */
async function requirePaidOwnerScene(dynamo, table, sceneId, userId) {
  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: table, Key: { scene_id: { S: sceneId } } })
  );
  if (!Item) {
    return { ok: false, statusCode: 404, body: { error: "Scene not found" } };
  }
  if (Item.user_id?.S !== userId) {
    return {
      ok: false,
      statusCode: 403,
      body: { error: "Forbidden: scene does not belong to this user" },
    };
  }

  const tier = await getUserTier(dynamo, userId);
  if (!PAID_TIERS.has(tier)) {
    return {
      ok: false,
      statusCode: 403,
      body: {
        error: "Downloading requires a paid plan",
        tier,
        requiredTier: "pro",
      },
    };
  }

  return { ok: true, item: Item, tier };
}

module.exports = { requirePaidOwnerScene, PAID_TIERS };
