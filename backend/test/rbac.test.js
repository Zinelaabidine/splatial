"use strict";

/**
 * Lightweight assertion-based tests for lib/rbac.js — no test framework is
 * configured in this package (see CLAUDE.md §4's "no test framework
 * configured" note for backend/), so these run directly under plain Node:
 *
 *   node backend/test/rbac.test.js
 */

const assert = require("node:assert/strict");
const { hasPermission, requirePermission, ROLE_PERMISSIONS, ADMIN_GROUP, MODERATOR_GROUP, BETA_GROUP } = require("../lib/rbac");

function eventWithGroups(groups) {
  return {
    requestContext: {
      authorizer: { jwt: { claims: { sub: "test-actor", "cognito:groups": groups } } },
    },
  };
}

// admin has every permission
for (const p of ROLE_PERMISSIONS[ADMIN_GROUP]) {
  assert.equal(hasPermission(eventWithGroups([ADMIN_GROUP]), p), true, `admin should have ${p}`);
}

// moderator has the moderation subset but not the admin-only actions
assert.equal(hasPermission(eventWithGroups([MODERATOR_GROUP]), "users.read"), true);
assert.equal(hasPermission(eventWithGroups([MODERATOR_GROUP]), "users.suspend"), true);
assert.equal(hasPermission(eventWithGroups([MODERATOR_GROUP]), "users.hard_delete"), false);
assert.equal(hasPermission(eventWithGroups([MODERATOR_GROUP]), "users.assign_roles"), false);
assert.equal(hasPermission(eventWithGroups([MODERATOR_GROUP]), "users.manage_plan"), false);

// beta_tester and plain users have no admin permissions at all
assert.equal(hasPermission(eventWithGroups([BETA_GROUP]), "users.read"), false);
assert.equal(hasPermission(eventWithGroups([]), "users.read"), false);

// permissions union across multiple groups
assert.equal(hasPermission(eventWithGroups([MODERATOR_GROUP, BETA_GROUP]), "users.suspend"), true);

// requirePermission returns null (allow) or a 403 response
assert.equal(requirePermission(eventWithGroups([ADMIN_GROUP]), "users.hard_delete"), null);
const denied = requirePermission(eventWithGroups([MODERATOR_GROUP]), "users.hard_delete");
assert.equal(denied.statusCode, 403);

// bracketed-string group claim form (API Gateway sometimes serializes this way)
const bracketedEvent = {
  requestContext: {
    authorizer: { jwt: { claims: { sub: "x", "cognito:groups": "[admin]" } } },
  },
};
assert.equal(hasPermission(bracketedEvent, "users.hard_delete"), true);

// unknown permission name is a programmer error, not a silent deny
assert.throws(() => hasPermission(eventWithGroups([ADMIN_GROUP]), "users.not_a_real_permission"));

console.log("rbac.test.js: all assertions passed");
