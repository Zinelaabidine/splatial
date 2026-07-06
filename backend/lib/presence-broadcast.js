"use strict";

const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require("@aws-sdk/client-apigatewaymanagementapi");

function managementClientFor(event) {
  const domain = event.requestContext?.domainName;
  const stage = event.requestContext?.stage;
  return new ApiGatewayManagementApiClient({
    endpoint: `https://${domain}/${stage}`,
  });
}

/**
 * Pushes the current viewer count for a scene to every connection watching
 * it. Called after both connect and disconnect so everyone's count stays
 * in sync without polling.
 */
async function broadcastViewerCount(event, sceneId, connections) {
  const client = managementClientFor(event);
  const payload = Buffer.from(
    JSON.stringify({
      type: "presence",
      sceneId,
      viewerCount: connections.length,
    })
  );

  await Promise.all(
    connections.map(async (item) => {
      const connectionId = item.connection_id?.S;
      if (!connectionId) return;
      try {
        await client.send(
          new PostToConnectionCommand({ ConnectionId: connectionId, Data: payload })
        );
      } catch (err) {
        // GoneException: the client disconnected without $disconnect firing
        // (browser killed, network dropped). Safe to ignore — the TTL in
        // lib/presence.js will clean up the stale row within 2 minutes.
        if (err.name !== "GoneException") throw err;
      }
    })
  );
}

module.exports = { broadcastViewerCount };
