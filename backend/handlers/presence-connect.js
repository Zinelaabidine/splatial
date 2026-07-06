"use strict";

const response = require("../lib/response");
const { recordConnection, listConnectionsForScene } = require("../lib/presence");
const { broadcastViewerCount } = require("../lib/presence-broadcast");

/**
 * $connect route. Identity comes from the REQUEST authorizer's context
 * (see handlers/presence-authorizer.js) — never trust a client-supplied
 * userId here.
 */
exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  const userId = event.requestContext?.authorizer?.userId;
  if (!connectionId || !userId) return response(401, { error: "Unauthorized" });

  const sceneId = event.queryStringParameters?.sceneId;
  if (!sceneId || typeof sceneId !== "string" || sceneId.trim() === "") {
    return response(400, { error: "Missing query parameter: sceneId" });
  }

  await recordConnection({ connectionId, sceneId, userId });

  const connections = await listConnectionsForScene(sceneId);
  await broadcastViewerCount(event, sceneId, connections);

  return response(200, { ok: true });
};
