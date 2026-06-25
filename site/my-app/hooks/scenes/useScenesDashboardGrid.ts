"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiSceneToDashboardScene,
  isActiveSceneStatus,
  POLL_INTERVAL_MS,
} from "@/lib/scenes/sceneMappers";
import { listScenes } from "@/server/services/scenesService";
import type { DashboardScene } from "@/types/splatworks";

export function useScenesDashboardGrid(search: string) {
  const router = useRouter();
  const [scenes, setScenes] = useState<DashboardScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const fetchScenes = useCallback(async (silent = false) => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await listScenes(ctrl.signal);
      setScenes((data.scenes ?? []).map(apiSceneToDashboardScene));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error("[useScenesDashboardGrid] fetch failed", err);
      setError("Failed to load scenes. Please try again.");
    } finally {
      if (!ctrl.signal.aborted && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchScenes();
    return () => abortCtrlRef.current?.abort();
  }, [fetchScenes]);

  useEffect(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    const hasActive = scenes.some(
      (s) => s.apiStatus && isActiveSceneStatus(s.apiStatus),
    );
    if (hasActive) {
      pollTimer.current = setTimeout(() => fetchScenes(true), POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [scenes, fetchScenes]);

  const filteredScenes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scenes;
    return scenes.filter((s) => s.title.toLowerCase().includes(q));
  }, [scenes, search]);

  const openScene = (scene: DashboardScene) => {
    if (scene.status === "completed" && scene.sceneId) {
      router.push(`/scenes/view?id=${scene.sceneId}`);
      return;
    }
    if (scene.status === "draft") {
      router.push("/scenes/create");
      return;
    }
    console.info("[Splatworks] Scene detail not implemented", scene.id);
  };

  const createScene = () => {
    router.push("/scenes/create");
  };

  return {
    scenes: filteredScenes,
    loading,
    error,
    fetchScenes,
    openScene,
    createScene,
  };
}
