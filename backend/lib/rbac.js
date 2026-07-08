"use strict";

/**
 * Granular permission model for the admin user-management surface.
 *
 * This sits ON TOP of the existing coarse Cognito-group gate (isAdmin() in
 * lib/admin-auth.js), which continues to answer "can this caller reach
 * /admin/* at all". This module answers the finer question: "of the actions
 * available under /admin/users/*, which ones can this specific caller take".
 *
 * Design choice — why groups, not a DB column, drive the ACTOR's permissions:
 * Cognito group membership is already embedded in the caller's JWT
 * (`cognito:groups`), so checking it here costs nothing extra (no DB read,
 * no extra AWS call) and can never drift from what Cognito itself will do at
 * next token refresh. The `roles` attribute cached on the `users` table (see
 * lib/cognito-admin.js + admin-users-roles.js) is a denormalized read-model
 * for fast list/detail display of a TARGET user's roles — Cognito groups
 * remain the single source of truth that's actually enforced here.
 *
 * Known limitation (inherited from useIsAdmin.ts / admin-auth.js): a role
 * change takes effect for the affected user's own admin-panel access only
 * after their ID token refreshes (sign-out/sign-in, or the token's natural
 * expiry). This mirrors the existing admin-group gate and is called out
 * explicitly rather than silently assumed.
 */

const { extractGroups, getClaims } = require("./admin-auth");
const response = require("./response");

const ADMIN_GROUP = (process.env.ADMIN_GROUP_NAME || "admin").trim();
const MODERATOR_GROUP = (process.env.MODERATOR_GROUP_NAME || "moderator").trim();
const BETA_GROUP = (process.env.BETA_GROUP_NAME || "beta_tester").trim();

// Roles assignable to a user via POST /admin/users/{userId}/roles. "user" is
// the implicit default for everyone and is never itself assigned/removed.
const ASSIGNABLE_ROLES = Object.freeze([ADMIN_GROUP, MODERATOR_GROUP, BETA_GROUP]);

const PERMISSIONS = Object.freeze([
  "users.read",
  "users.update",
  "users.suspend",
  "users.ban",
  "users.reactivate",
  "users.verify_override",
  "users.reset_password",
  "users.revoke_sessions",
  "users.soft_delete",
  "users.hard_delete",
  "users.assign_roles",
  "users.manage_plan",
  "audit_logs.read",
]);

// Moderators can look, search, and de-escalate/escalate account STANDING
// (suspend/ban/reactivate/verify/reset password/force logout) but cannot
// destroy data, reassign roles, or change billing — those stay admin-only.
const MODERATOR_PERMISSIONS = Object.freeze([
  "users.read",
  "users.update",
  "users.suspend",
  "users.ban",
  "users.reactivate",
  "users.verify_override",
  "users.reset_password",
  "users.revoke_sessions",
  "audit_logs.read",
]);

const ROLE_PERMISSIONS = Object.freeze({
  [ADMIN_GROUP]: PERMISSIONS,
  [MODERATOR_GROUP]: MODERATOR_PERMISSIONS,
  [BETA_GROUP]: Object.freeze([]),
});

/** All permissions the caller holds, unioned across every group they belong to. */
function permissionsForGroups(groups) {
  const set = new Set();
  for (const g of groups) {
    for (const p of ROLE_PERMISSIONS[g] ?? []) set.add(p);
  }
  return set;
}

function callerGroups(event) {
  return extractGroups(getClaims(event));
}

function hasPermission(event, permission) {
  if (!PERMISSIONS.includes(permission)) {
    throw new Error(`Unknown permission: ${permission}`);
  }
  return permissionsForGroups(callerGroups(event)).has(permission);
}

/** Returns a 403 response if the caller lacks `permission`, otherwise null. */
function requirePermission(event, permission) {
  if (!hasPermission(event, permission)) {
    return response(403, {
      error: `Forbidden: missing permission "${permission}"`,
    });
  }
  return null;
}

module.exports = {
  ADMIN_GROUP,
  MODERATOR_GROUP,
  BETA_GROUP,
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  callerGroups,
  hasPermission,
  requirePermission,
  getClaims,
};
