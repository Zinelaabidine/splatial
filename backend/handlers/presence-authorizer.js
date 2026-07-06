"use strict";

const { verifyIdToken } = require("../lib/cognito-verifier");

/**
 * API Gateway v2 WebSocket REQUEST authorizer for the presence API's
 * $connect route (see infra/modules/static-site/websocket-api.tf).
 *
 * The client can't set a custom Authorization header on a browser
 * WebSocket handshake, so the Cognito ID token travels as a query string
 * parameter instead: wss://.../?token=...&sceneId=...
 */
exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;
  if (!token) {
    throw new Error("Unauthorized");
  }

  let payload;
  try {
    payload = await verifyIdToken(token);
  } catch (err) {
    // Do not log the raw token or full claims (CLAUDE.md §5 — no sensitive
    // fields in logs). err.name alone is enough to distinguish expiry from
    // a malformed/forged token in CloudWatch.
    console.error("presence-authorizer: token verification failed", {
      name: err.name,
    });
    throw new Error("Unauthorized");
  }

  return {
    principalId: payload.sub,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: event.methodArn,
        },
      ],
    },
    context: {
      userId: payload.sub,
    },
  };
};
