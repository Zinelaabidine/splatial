"use strict";

const { GetItemCommand } = require("@aws-sdk/client-dynamodb");

/**
 * Per-tier weekly training-job caps (rolling 7-day window — see
 * getRollingWindowCount in lib/quota.js). `null` means unlimited.
 * Keep in sync with pricing-page copy — this is the single source of truth
 * the backend enforces against.
 */
const TIER_LIMITS = Object.freeze({
  free: 1,
  pro: null,
});

const DEFAULT_TIER = "free";

/**
 * Look up a user's subscription tier from the `users` table.
 *
 * A missing row is treated as "free" rather than an error — users are never
 * provisioned a row up front, so absence just means "hasn't been assigned
 * anything else yet." An unrecognized tier value (e.g. a row corrupted or
 * written by a future migration) also falls back to "free" rather than
 * silently granting unlimited access.
 */
async function getUserTier(dynamo, userId) {
  const usersTable = process.env.USERS_TABLE_NAME;

  const { Item } = await dynamo.send(
    new GetItemCommand({
      TableName: usersTable,
      Key: { user_id: { S: userId } },
    })
  );

  const tier = Item?.tier?.S;
  return tier && Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier)
    ? tier
    : DEFAULT_TIER;
}

module.exports = { getUserTier, TIER_LIMITS, DEFAULT_TIER };
