"use strict";

const response = require("../lib/response");
const {
  getConnection,
  removeConnection,
  listConnectionsForScene,
} = require("../lib/presence");
const { broadcastViewerCount } = require("../lib/presence-broadcast");

/**
 * $disconnect route. API Gateway calls this best-effort — it is not
 * guaranteed to fire (crashed tab, killed process, lost network), which is
 * exactly why connections also carry a TTL (see lib/presence.js).
 */
exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) return response(200, { ok: true });

  const existing = await getConnection(connectionId);
  const sceneId = existing?.scene_id?.S ?? null;

  await removeConnection(connectionId);

  if (sceneId) {
    const connections = await listConnectionsForScene(sceneId);
    await broadcastViewerCount(event, sceneId, connections);
  }

  return response(200, { ok: true });
};
