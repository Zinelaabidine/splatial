"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiSceneToDashboardScene,
  isActiveSceneStatus,
  POLL_INTERVAL_MS,
} from "@/lib/scenes/sceneMappers";
import { cancelJob, submitJob } from "@/services/jobsService";
import { deleteScene, listScenes } from "@/services/scenesService";
import type { DashboardScene } from "@/types/splatworks";

export function useScenesDashboardGrid(search: string) {
  const router = useRouter();
  const [scenes, setScenes] = useState<DashboardScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [modalCancelling, setModalCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardScene | null>(null);
  const [editTarget, setEditTarget] = useState<DashboardScene | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    }
  };

  const submitScene = useCallback(
    async (scene: DashboardScene) => {
      if (!scene.sceneId || submittingId) return;
      setSubmittingId(scene.sceneId);
      setActionError(null);
      setActionMessage(null);
      setScenes((prev) =>
        prev.map((s) =>
          s.sceneId === scene.sceneId
            ? {
                ...s,
                status: "queued",
                apiStatus: "QUEUED",
                caption: "In queue",
              }
            : s,
        ),
      );
      try {
        await submitJob(scene.sceneId);
        await fetchScenes(true);
      } catch (err) {
        console.error("[useScenesDashboardGrid] submit failed", err);
        setActionError("Failed to submit scene. Please try again.");
        await fetchScenes(true);
      } finally {
        setSubmittingId(null);
      }
    },
    [fetchScenes, submittingId],
  );

  const runCancelJob = useCallback(
    async (sceneId: string, closeModalOnSuccess: boolean) => {
      setCancellingId(sceneId);
      setModalCancelling(closeModalOnSuccess);
      setDeleteError(null);
      setActionError(null);
      setActionMessage(null);
      try {
        await cancelJob(sceneId);
        setActionMessage("Processing cancelled. You can submit again or delete the scene.");
        await fetchScenes(true);
        if (closeModalOnSuccess) {
          setDeleteTarget(null);
        }
      } catch (err) {
        console.error("[useScenesDashboardGrid] cancel failed", err);
        const msg =
          err instanceof Error ? err.message : "Failed to cancel processing. Please try again.";
        if (closeModalOnSuccess) {
          setDeleteError(msg);
        } else {
          setActionError(msg);
        }
        await fetchScenes(true);
      } finally {
        setCancellingId(null);
        setModalCancelling(false);
      }
    },
    [fetchScenes],
  );

  const cancelScene = useCallback(
    (scene: DashboardScene) => {
      if (!scene.sceneId || cancellingId) return;
      void runCancelJob(scene.sceneId, false);
    },
    [cancellingId, runCancelJob],
  );

  const handleCancelFromModal = useCallback(() => {
    if (!deleteTarget?.sceneId || modalCancelling) return;
    void runCancelJob(deleteTarget.sceneId, true);
  }, [deleteTarget, modalCancelling, runCancelJob]);

  const createScene = () => {
    router.push("/scenes/create");
  };

  const handleDeleteRequest = useCallback((scene: DashboardScene) => {
    setDeleteError(null);
    setDeleteTarget(scene);
  }, []);

  const handleEditRequest = useCallback((scene: DashboardScene) => {
    setEditError(null);
    setEditTarget(scene);
  }, []);

  const dismissEditModal = useCallback(() => {
    if (!editSaving) {
      setEditTarget(null);
      setEditError(null);
    }
  }, [editSaving]);

  const handleSceneEdited = useCallback(
    (updated: { title: string; thumbnailUrl?: string }) => {
      if (!editTarget) return;
      setScenes((prev) =>
        prev.map((s) =>
          s.id === editTarget.id
            ? {
                ...s,
                title: updated.title,
                ...(updated.thumbnailUrl
                  ? { thumbnailUrl: updated.thumbnailUrl, preview: undefined }
                  : {}),
              }
            : s,
        ),
      );
      setEditTarget(null);
      setEditError(null);
      setActionMessage("Scene updated.");
    },
    [editTarget],
  );

  const dismissDeleteModal = useCallback(() => {
    if (!deleting && !modalCancelling) {
      setDeleteTarget(null);
      setDeleteError(null);
    }
  }, [deleting, modalCancelling]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const sceneId = deleteTarget.sceneId ?? deleteTarget.id;

    setDeleting(true);
    setDeleteError(null);
    setActionMessage(null);
    try {
      const result = await deleteScene(sceneId);
      setScenes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      setActionMessage(
        result.cancelledJob
          ? "Processing was stopped and the scene was deleted."
          : "Scene deleted.",
      );
    } catch (err) {
      console.error("[useScenesDashboardGrid] delete failed", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete scene. Please try again.",
      );
      await fetchScenes(true);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchScenes]);

  return {
    scenes: filteredScenes,
    loading,
    error,
    actionError,
    actionMessage,
    submittingId,
    cancellingId,
    modalCancelling,
    fetchScenes,
    openScene,
    submitScene,
    cancelScene,
    handleCancelFromModal,
    createScene,
    clearActionError: () => setActionError(null),
    clearActionMessage: () => setActionMessage(null),
    deleteTarget,
    deleting,
    deleteError,
    remove: handleDeleteRequest,
    edit: handleEditRequest,
    editTarget,
    editSaving,
    editError,
    setEditSaving,
    setEditError,
    dismissEditModal,
    handleSceneEdited,
    dismissDeleteModal,
    confirmDelete,
  };
}
