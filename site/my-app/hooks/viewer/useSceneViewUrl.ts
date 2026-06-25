"use client";

import { useEffect, useState } from "react";

import { getSceneViewUrl } from "@/server/services/scenesService";

export function useSceneViewUrl(sceneId: string) {
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(sceneId));

  useEffect(() => {
    if (!sceneId) return;

    let cancelled = false;
    const ctrl = new AbortController();

    void (async () => {
      setLoading(true);
      setFetchError(null);
      setSplatUrl(null);

      try {
        const { url } = await getSceneViewUrl(sceneId, ctrl.signal);
        if (!cancelled) setSplatUrl(url);
      } catch (err) {
        if (!cancelled) {
          console.error("[useSceneViewUrl] failed to fetch view URL", err);
          setFetchError("Failed to load the 3D scene. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sceneId]);

  return {
    splatUrl: sceneId ? splatUrl : null,
    error: sceneId ? fetchError : "No scene selected.",
    loading: sceneId ? loading : false,
  };
}
