"use client";

import { useEffect, useState } from "react";

import { mapViewUrlError } from "@/lib/viewer/viewUrlErrors";
import { getSceneViewUrl, listScenes } from "@/server/services/scenesService";

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
        const scenesResp = await listScenes(ctrl.signal);
        const scene = (scenesResp.scenes ?? []).find((s) => s.sceneId === sceneId);

        if (!scene) {
          if (!cancelled) setFetchError("Scene not found.");
          return;
        }

        if (scene.status !== "READY") {
          if (!cancelled) {
            setFetchError(
              `This scene is still ${scene.status.toLowerCase().replace(/_/g, " ")}. Open it again once processing finishes.`,
            );
          }
          return;
        }

        const { url } = await getSceneViewUrl(sceneId, ctrl.signal);
        if (!cancelled) setSplatUrl(url);
      } catch (err) {
        if (!cancelled) {
          if (
            !(err instanceof DOMException && err.name === "AbortError") &&
            !ctrl.signal.aborted
          ) {
            console.error("[useSceneViewUrl] failed to fetch view URL", err);
          }
          setFetchError(mapViewUrlError(err));
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
