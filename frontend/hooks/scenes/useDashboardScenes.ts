"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiSceneToCard,
  isActiveSceneStatus,
  POLL_INTERVAL_MS,
} from "@/lib/scenes/sceneMappers";
import { cancelJob, submitJob } from "@/services/jobsService";
import { deleteScene, listScenes } from "@/services/scenesService";
import type { MockScene, SortOption } from "@/types/dashboard";

export function useDashboardScenes() {
  const router = useRouter();
  const [scenes, setScenes] = useState<MockScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockScene | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [modalCancelling, setModalCancelling] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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
      (s) => s.apiStatus != null && isActiveSceneStatus(s.apiStatus),
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
    setDeleteError(null);
    setDeleteTarget(scene);
  }, []);

  const dismissDeleteModal = useCallback(() => {
    if (!deleting && !modalCancelling) {
      setDeleteTarget(null);
      setDeleteError(null);
    }
  }, [deleting, modalCancelling]);

  const runCancelJob = useCallback(
    async (sceneId: string, closeModalOnSuccess: boolean) => {
      setCancellingId(sceneId);
      setModalCancelling(closeModalOnSuccess);
      setDeleteError(null);
      setActionMessage(null);
      try {
        await cancelJob(sceneId);
        setActionMessage("Processing cancelled. You can submit again or delete the scene.");
        await fetchScenes(true);
        if (closeModalOnSuccess) {
          setDeleteTarget(null);
        }
      } catch (err) {
        console.error("[useDashboardScenes] cancel failed", err);
        const msg =
          err instanceof Error ? err.message : "Failed to cancel processing. Please try again.";
        if (closeModalOnSuccess) {
          setDeleteError(msg);
        } else {
          setActionMessage(null);
          setError(msg);
        }
        await fetchScenes(true);
      } finally {
        setCancellingId(null);
        setModalCancelling(false);
      }
    },
    [fetchScenes],
  );

  const handleCancelScene = useCallback(
    (scene: MockScene) => {
      if (!scene.sceneId || cancellingId) return;
      void runCancelJob(scene.sceneId, false);
    },
    [cancellingId, runCancelJob],
  );

  const handleCancelFromModal = useCallback(() => {
    if (!deleteTarget?.sceneId || modalCancelling) return;
    void runCancelJob(deleteTarget.sceneId, true);
  }, [deleteTarget, modalCancelling, runCancelJob]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.sceneId) return;
    setDeleting(true);
    setDeleteError(null);
    setActionMessage(null);
    try {
      const result = await deleteScene(deleteTarget.sceneId);
      setScenes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      setActionMessage(
        result.cancelledJob
          ? "Processing was stopped and the scene was deleted."
          : "Scene deleted.",
      );
    } catch (err) {
      console.error("[useDashboardScenes] delete failed", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete scene. Please try again.",
      );
      await fetchScenes(true);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchScenes]);

  const handleSubmitScene = useCallback(
    async (scene: MockScene) => {
      if (!scene.sceneId) return;
      setScenes((prev) =>
        prev.map((s) =>
          s.id === scene.id
            ? { ...s, state: "preprocessing" as const, apiStatus: "QUEUED" as const }
            : s,
        ),
      );
      try {
        await submitJob(scene.sceneId);
        await fetchScenes(true);
      } catch (err) {
        console.error("[useDashboardScenes] submit failed", err);
        await fetchScenes(true);
      }
    },
    [fetchScenes],
  );

  const clearActionMessage = useCallback(() => setActionMessage(null), []);

  return {
    sorted,
    loading,
    error,
    actionMessage,
    sortBy,
    sortOpen,
    deleteTarget,
    deleting,
    deleteError,
    cancellingId,
    modalCancelling,
    sceneCount: scenes.length,
    setSortBy,
    setSortOpen,
    fetchScenes,
    handleViewScene,
    handleDeleteScene,
    handleSubmitScene,
    handleCancelScene,
    handleCancelFromModal,
    dismissDeleteModal,
    confirmDelete,
    clearActionMessage,
  };
}
