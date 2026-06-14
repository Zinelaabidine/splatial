"use client";

import { useEffect, useState } from "react";

import { getSceneViewUrl } from "@/server/services/scenesService";

export function useSceneViewUrl(sceneId: string) {
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sceneId) {
      setLoading(false);
      setError("No scene selected.");
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();

    const init = async () => {
      try {
        const { url } = await getSceneViewUrl(sceneId, ctrl.signal);
        if (cancelled) return;
        setSplatUrl(url);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("[useSceneViewUrl] failed to fetch view URL", err);
          setError("Failed to load the 3D scene. Please try again.");
          setLoading(false);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sceneId]);

  return { splatUrl, error, loading };
}
