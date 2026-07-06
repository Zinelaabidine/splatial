"use strict";

const response = require("../lib/response");
const { refreshConnection } = require("../lib/presence");

/**
 * Custom "heartbeat" route the client pings every ~60s to keep its
 * connection's TTL from expiring (see CONNECTION_TTL_SECONDS in
 * lib/presence.js). No broadcast here — only connect/disconnect change the
 * viewer count.
 */
exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) return response(401, { error: "Unauthorized" });

  try {
    await refreshConnection(connectionId);
  } catch (err) {
    // Row already expired/removed between pings — the client should
    // reconnect; this is not a server error.
    if (err.name !== "ConditionalCheckFailedException") throw err;
  }

  return response(200, { ok: true });
};
