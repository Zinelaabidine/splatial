"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const response = require("../lib/response");
const { getUserTier } = require("../lib/user-tier");
const { getStorageCapBytes, getStorageUsedBytes } = require("../lib/storage-quota");

const dynamo = new DynamoDBClient({});

/**
 * GET /api/v1/account/usage
 *
 * Returns the caller's subscription tier and current storage usage against
 * that tier's cap (see lib/storage-quota.js). Powers the usage indicator on
 * the settings page — the underlying bytes-used counter itself is maintained
 * by init.js/complete.js/attempt-patch.js/scene-delete.js/retention-sweep.js.
 *
 * Success (200): { tier, usedBytes, capBytes }
 */
exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Unauthorized: missing user identity" });

  const tier = await getUserTier(dynamo, userId);
  const usedBytes = await getStorageUsedBytes(dynamo, userId);
  const capBytes = getStorageCapBytes(tier);

  return response(200, { tier, usedBytes, capBytes });
};
