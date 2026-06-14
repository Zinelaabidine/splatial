"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiSceneToCard,
  POLL_INTERVAL_MS,
} from "@/lib/scenes/sceneMappers";
import { submitJob } from "@/server/services/jobsService";
import { deleteScene, listScenes } from "@/server/services/scenesService";
import type { MockScene, SortOption } from "@/types/dashboard";

export function useDashboardScenes() {
  const router = useRouter();
  const [scenes, setScenes] = useState<MockScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockScene | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
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
      setScenes((data.scenes ?? []).map(apiSceneToCard));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error("[useDashboardScenes] fetch failed", err);
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
      (s) => s.state === "processing" || s.state === "preprocessing",
    );
    if (hasActive) {
      pollTimer.current = setTimeout(() => fetchScenes(true), POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [scenes, fetchScenes]);

  const sorted = useMemo(() => {
    const copy = [...scenes];
    switch (sortBy) {
      case "name":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "oldest":
        return copy.reverse();
      default:
        return copy;
    }
  }, [scenes, sortBy]);

  const handleViewScene = useCallback(
    (scene: MockScene) => {
      if (scene.sceneId) {
        router.push(`/scenes/view?id=${scene.sceneId}`);
      }
    },
    [router],
  );

  const handleDeleteScene = useCallback((scene: MockScene) => {
    setDeleteTarget(scene);
  }, []);

  const dismissDeleteModal = useCallback(() => {
    if (!deleting) setDeleteTarget(null);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.sceneId) return;
    setDeleting(true);
    try {
      await deleteScene(deleteTarget.sceneId);
      setScenes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("[useDashboardScenes] delete failed", err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleSubmitScene = useCallback(
    async (scene: MockScene) => {
      if (!scene.sceneId) return;
      setScenes((prev) =>
        prev.map((s) =>
          s.id === scene.id ? { ...s, state: "preprocessing" as const } : s,
        ),
      );
      try {
        await submitJob(scene.sceneId);
        fetchScenes(true);
      } catch (err) {
        console.error("[useDashboardScenes] submit failed", err);
        setScenes((prev) =>
          prev.map((s) =>
            s.id === scene.id ? { ...s, state: "uploaded" as const } : s,
          ),
        );
      }
    },
    [fetchScenes],
  );

  return {
    sorted,
    loading,
    error,
    sortBy,
    sortOpen,
    deleteTarget,
    deleting,
    sceneCount: scenes.length,
    setSortBy,
    setSortOpen,
    fetchScenes,
    handleViewScene,
    handleDeleteScene,
    handleSubmitScene,
    dismissDeleteModal,
    confirmDelete,
  };
}
