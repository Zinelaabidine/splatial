"use strict";

const { GetItemCommand } = require("@aws-sdk/client-dynamodb");

/**
 * Account standing, cached on the `users` table (same row as `tier` — see
 * lib/user-tier.js). A missing row / missing attribute means ACTIVE: users
 * are never provisioned a row up front (see getUserTier's rationale), so
 * absence just means "nothing has ever restricted this account."
 *
 * State machine (enforced here, mutated by the admin-users-* handlers):
 *   ACTIVE -> SUSPENDED -> ACTIVE (reactivate)
 *   ACTIVE|SUSPENDED -> BANNED -> ACTIVE (reactivate)
 *   ACTIVE|SUSPENDED|BANNED -> SOFT_DELETED  (terminal in practice; a support
 *     escalation could reactivate, but there is no dedicated "undelete" flow)
 *   * -> HARD_DELETED (terminal, see admin-users-hard-delete.js)
 */
const ACCOUNT_STATUSES = Object.freeze([
  "ACTIVE",
  "SUSPENDED",
  "BANNED",
  "SOFT_DELETED",
  "HARD_DELETED",
]);

const DEFAULT_STATUS = "ACTIVE";

// Statuses that block new job submissions and new uploads. Running jobs are
// left alone (see submit-job.js / cancel-job.js) — only entry points that
// would create NEW compute/storage work are gated here.
const BLOCKS_NEW_WORK = new Set(["SUSPENDED", "BANNED", "SOFT_DELETED", "HARD_DELETED"]);

async function getUserStatus(dynamo, userId) {
  const usersTable = process.env.USERS_TABLE_NAME;
  const { Item } = await dynamo.send(
    new GetItemCommand({
      TableName: usersTable,
      Key: { user_id: { S: userId } },
    })
  );
  const status = Item?.status?.S;
  return status && ACCOUNT_STATUSES.includes(status) ? status : DEFAULT_STATUS;
}

/**
 * Returns a user-facing error string if `status` should block new job
 * submission / upload, or null if the account is in good standing.
 */
function blockReasonForNewWork(status) {
  if (!BLOCKS_NEW_WORK.has(status)) return null;
  switch (status) {
    case "SUSPENDED":
      return "Your account is suspended. New uploads and training jobs are disabled until it is reactivated.";
    case "BANNED":
      return "Your account is banned. New uploads and training jobs are disabled.";
    case "SOFT_DELETED":
    case "HARD_DELETED":
      return "This account no longer has upload or processing access.";
    default:
      return "Your account cannot perform this action right now.";
  }
}

module.exports = {
  ACCOUNT_STATUSES,
  DEFAULT_STATUS,
  BLOCKS_NEW_WORK,
  getUserStatus,
  blockReasonForNewWork,
};
