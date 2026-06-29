"use client";

import { useEffect, useState } from "react";

import { listScenes } from "@/services/scenesService";

/** True when the scene appears in the caller's library (i.e. they own it). */
export function useIsSceneOwner(sceneId: string): boolean {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!sceneId) return;

    let cancelled = false;
    const ctrl = new AbortController();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOwner(false);

    void listScenes(ctrl.signal)
      .then((res) => {
        if (cancelled) return;
        const owned = (res.scenes ?? []).some((s) => s.sceneId === sceneId);
        setIsOwner(owned);
      })
      .catch(() => {
        if (!cancelled) setIsOwner(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sceneId]);

  return isOwner;
}
