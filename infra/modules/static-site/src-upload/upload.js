"use strict";

const init = require("./handlers/init");
const presign = require("./handlers/presign");
const complete = require("./handlers/complete");
const sceneStatus = require("./handlers/scene-status");
const response = require("./lib/response");

exports.handler = async (event) => {
  try {
    switch (event.routeKey) {
      case "POST /upload/init":
        return await init.handler(event);
      case "POST /upload/presign":
        return await presign.handler(event);
      case "POST /upload/complete":
        return await complete.handler(event);
      case "GET /scenes/{sceneId}":
        return await sceneStatus.handler(event);
      default:
        return response(404, { error: "Not found" });
    }
  } catch (err) {
    console.error("unhandled error", { route: event.routeKey, err });
    return response(500, { error: "Internal server error" });
  }
};
