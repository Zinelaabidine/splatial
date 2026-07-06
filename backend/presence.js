"use strict";

// Entry point for the presence WebSocket Lambda (see
// infra/modules/static-site/websocket-api.tf, handler = "presence.handler").
// Packaged from the same backend/ zip as upload.js — a second entry point
// in the same archive, not a separate build.

const connect = require("./handlers/presence-connect");
const disconnect = require("./handlers/presence-disconnect");
const heartbeat = require("./handlers/presence-heartbeat");
const response = require("./lib/response");

exports.handler = async (event) => {
  const routeKey = event.requestContext?.routeKey;
  try {
    switch (routeKey) {
      case "$connect":
        return await connect.handler(event);
      case "$disconnect":
        return await disconnect.handler(event);
      case "heartbeat":
        return await heartbeat.handler(event);
      default:
        return response(400, { error: `Unknown route: ${routeKey}` });
    }
  } catch (err) {
    console.error("presence router error", { routeKey, name: err.name });
    return response(500, { error: "Internal server error" });
  }
};
