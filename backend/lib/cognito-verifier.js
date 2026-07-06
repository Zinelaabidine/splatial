"use strict";

const { CognitoJwtVerifier } = require("aws-jwt-verify");

// Built lazily and cached across warm invocations (same rationale as
// instantiating AWS SDK clients at module scope — see CLAUDE.md §5).
let verifier = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: process.env.COGNITO_CLIENT_ID,
    });
  }
  return verifier;
}

/**
 * Verifies a Cognito ID token and returns its claims, or throws.
 * Used by the presence WebSocket $connect authorizer, which can't rely on
 * API Gateway's built-in JWT authorizer type (HTTP-API-only) because a
 * browser's WebSocket handshake can't carry a custom Authorization header.
 */
async function verifyIdToken(token) {
  return getVerifier().verify(token);
}

module.exports = { verifyIdToken };
