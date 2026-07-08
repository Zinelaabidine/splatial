"use strict";

const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  AdminResetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  ListUsersInGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const cognito = new CognitoIdentityProviderClient({});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

/**
 * Thin wrapper around the Cognito Admin* API surface used by the admin
 * user-management handlers. Every function takes `userId` (the Cognito
 * `sub`, same identifier used as the DynamoDB partition key everywhere else
 * in this codebase — profiles, users, scenes all key off `sub`).
 *
 * NOTE ON Username VS sub: Cognito's Admin* APIs accept the user's `sub` as
 * the `Username` parameter interchangeably with the pool's actual username
 * (AWS resolves it internally), which is what lets this module stay
 * consistent with the rest of the app treating `sub` as canonical. This
 * assumption should be smoke-tested against the deployed user pool before
 * this ships to prod (see the follow-up note in the implementation summary).
 */

function attrValue(attrs, name) {
  return attrs?.find((a) => a.Name === name)?.Value ?? null;
}

/** Cognito's view of a user: status, verification flags, timestamps. */
async function adminGetUser(userId) {
  const out = await cognito.send(
    new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
  return {
    username: out.Username,
    enabled: out.Enabled,
    userStatus: out.UserStatus, // CONFIRMED | UNCONFIRMED | FORCE_CHANGE_PASSWORD | ...
    userCreateDate: out.UserCreateDate ? new Date(out.UserCreateDate).toISOString() : null,
    // Best available proxy for "last login" — Cognito doesn't expose true
    // last-authentication time without Advanced Security / CloudTrail. This
    // reflects the last time ANY user attribute changed (including
    // self-service profile edits), so it is labeled accordingly in the UI.
    userLastModifiedDate: out.UserLastModifiedDate
      ? new Date(out.UserLastModifiedDate).toISOString()
      : null,
    email: attrValue(out.UserAttributes, "email"),
    emailVerified: attrValue(out.UserAttributes, "email_verified") === "true",
    phoneNumber: attrValue(out.UserAttributes, "phone_number"),
    phoneVerified: attrValue(out.UserAttributes, "phone_number_verified") === "true",
  };
}

async function adminListGroupsForUser(userId) {
  const out = await cognito.send(
    new AdminListGroupsForUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
  return (out.Groups ?? []).map((g) => g.GroupName);
}

async function adminAddUserToGroup(userId, groupName) {
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
      GroupName: groupName,
    })
  );
}

async function adminRemoveUserFromGroup(userId, groupName) {
  await cognito.send(
    new AdminRemoveUserFromGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
      GroupName: groupName,
    })
  );
}

/** Blocks all future sign-in attempts immediately (used by ban + soft delete). */
async function adminDisableUser(userId) {
  await cognito.send(
    new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
}

/** Restores sign-in ability (used by reactivate). Safe to call even if not disabled. */
async function adminEnableUser(userId) {
  await cognito.send(
    new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
}

/**
 * Invalidates refresh tokens so the user cannot silently re-authenticate.
 * Any already-issued access/ID token remains valid until its own (short)
 * expiry — Cognito has no server-side JWT revocation. This is the same
 * caveat useIsAdmin.ts already documents for admin-group changes.
 */
async function adminUserGlobalSignOut(userId) {
  await cognito.send(
    new AdminUserGlobalSignOutCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
}

/** Forces the user to set a new password at next sign-in. */
async function adminResetUserPassword(userId) {
  await cognito.send(
    new AdminResetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
}

/** Manual verification override for email and/or phone. */
async function adminSetVerification(userId, { emailVerified, phoneVerified } = {}) {
  const attrs = [];
  if (emailVerified !== undefined) {
    attrs.push({ Name: "email_verified", Value: emailVerified ? "true" : "false" });
  }
  if (phoneVerified !== undefined) {
    attrs.push({ Name: "phone_number_verified", Value: phoneVerified ? "true" : "false" });
  }
  if (attrs.length === 0) return;
  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
      UserAttributes: attrs,
    })
  );
}

/**
 * Permanently removes the Cognito identity (irreversible — no future sign-in
 * will ever be possible for this account again, even under a new password).
 * Used ONLY by the hard-delete flow. DynamoDB rows are NOT deleted alongside
 * this — they are anonymized and status-flagged instead, to preserve
 * referential integrity, audit history, and billing records (see
 * admin-users-hard-delete.js for the documented tradeoff).
 */
async function adminDeleteUser(userId) {
  await cognito.send(
    new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  );
}

/** Every `sub` currently in `groupName` — used to guard against demoting the last admin. */
async function listUserIdsInGroup(groupName) {
  const ids = [];
  let token;
  do {
    const out = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: groupName,
        NextToken: token,
      })
    );
    for (const u of out.Users ?? []) {
      const sub = attrValue(u.Attributes, "sub");
      if (sub) ids.push(sub);
    }
    token = out.NextToken;
  } while (token);
  return ids;
}

module.exports = {
  adminGetUser,
  adminListGroupsForUser,
  adminAddUserToGroup,
  adminRemoveUserFromGroup,
  adminDisableUser,
  adminEnableUser,
  adminUserGlobalSignOut,
  adminResetUserPassword,
  adminSetVerification,
  adminDeleteUser,
  listUserIdsInGroup,
};
