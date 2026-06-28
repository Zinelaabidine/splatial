"use client";

import { useEffect, useState } from "react";

import { isExpectedSceneConflict } from "@/lib/api/apiErrors";
import { mapViewUrlError } from "@/lib/viewer/viewUrlErrors";
import { getSceneStatus, getSceneViewUrl } from "@/services/scenesService";

function formatPendingStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}

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
        const scene = await getSceneStatus(sceneId, ctrl.signal);

        if (scene.status !== "READY") {
          if (!cancelled) {
            setFetchError(
              `This scene is still ${formatPendingStatus(scene.status)}. Open it again once processing finishes.`,
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
            !ctrl.signal.aborted &&
            !isExpectedSceneConflict(err)
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
