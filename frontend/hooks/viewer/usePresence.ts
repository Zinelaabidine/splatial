"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const PRESENCE_WS_URL = process.env.NEXT_PUBLIC_PRESENCE_WS_URL;
const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Live "how many other people are looking at this scene right now" count,
 * backed by the presence WebSocket API (infra/modules/static-site/
 * websocket-api.tf + backend/presence.js).
 *
 * This is Phase-2 infrastructure that may not be deployed to every
 * environment. Returns `null` and never opens a socket when
 * NEXT_PUBLIC_PRESENCE_WS_URL is unset (set at build time from the
 * presence_ws_endpoint Terraform output in deploy.yml), so callers should treat `null` as
 * "no presence data" rather than "zero viewers" and hide the UI entirely
 * in that case — see SceneInfoCard.
 */
export function usePresence(sceneId: string): number | null {
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!PRESENCE_WS_URL || !sceneId) return;

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let socket: WebSocket | null = null;

    void (async () => {
      let token: string | undefined;
      try {
        const session = await fetchAuthSession();
        token = session.tokens?.idToken?.toString();
      } catch {
        return; // Not signed in yet — presence is a nice-to-have, fail silent.
      }
      if (!token || cancelled) return;

      const url = `${PRESENCE_WS_URL}?token=${encodeURIComponent(token)}&sceneId=${encodeURIComponent(sceneId)}`;
      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            sceneId?: string;
            viewerCount?: number;
          };
          if (data.type === "presence" && data.sceneId === sceneId) {
            setViewerCount(data.viewerCount ?? null);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      socket.onopen = () => {
        heartbeatTimer = setInterval(() => {
          socket?.send(JSON.stringify({ action: "heartbeat" }));
        }, HEARTBEAT_INTERVAL_MS);
      };
    })();

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [sceneId]);

  return PRESENCE_WS_URL ? viewerCount : null;
}
