"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiSceneToDashboardScene,
  isActiveSceneStatus,
  POLL_INTERVAL_MS,
} from "@/lib/scenes/sceneMappers";
import { cancelJob, submitJob, type SubmitJobOptions } from "@/services/jobsService";
import { deleteScene, listScenes, updateScene } from "@/services/scenesService";
import { ApiRequestError, isQuotaExceededError } from "@/lib/api/apiErrors";
import { sceneSettingsUrl, sceneViewerUrl } from "@/lib/scenes/viewerUrls";
import type { SceneVisibility } from "@/types/api";
import type { DashboardScene, SceneStatus } from "@/types/splatworks";
import type { SortOption } from "@/types/dashboard";

export type StatusFilter = SceneStatus | "all";
export type SceneViewMode = "grid" | "list";

const SORT_OPTIONS: SortOption[] = ["newest", "oldest", "name"];
export const STATUS_FILTER_OPTIONS: StatusFilter[] = [
  "all",
  "draft",
  "queued",
  "training",
  "completed",
  "failed",
];

function sortScenes(list: DashboardScene[], sortBy: SortOption): DashboardScene[] {
  const copy = [...list];
  switch (sortBy) {
    case "name":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "oldest":
      return copy.sort((a, b) =>
        (a.createdAtIso ?? "").localeCompare(b.createdAtIso ?? ""),
      );
    default:
      return copy.sort((a, b) =>
        (b.createdAtIso ?? "").localeCompare(a.createdAtIso ?? ""),
      );
  }
}

export function useScenesDashboardGrid(search: string) {
  const router = useRouter();
  const [scenes, setScenes] = useState<DashboardScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const [viewMode, setViewMode] = useState<SceneViewMode>("grid");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [modalCancelling, setModalCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [quotaLimitReached, setQuotaLimitReached] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardScene | null>(null);
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<string | null>(null);
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
    let list = scenes;
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q));
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    return sortScenes(list, sortBy);
  }, [scenes, search, statusFilter, sortBy]);

  const openScene = (scene: DashboardScene) => {
    if (scene.status === "completed" && scene.sceneId) {
      router.push(
        sceneViewerUrl(scene.sceneId, {
          forkedFromSceneId: scene.forkedFromSceneId,
          forkedFromUsername: scene.forkedFromUsername,
        }),
      );
    }
  };

  const submitScene = useCallback(
    async (scene: DashboardScene, options?: SubmitJobOptions) => {
      if (!scene.sceneId || submittingId) return;
      setSubmittingId(scene.sceneId);
      setActionError(null);
      setActionMessage(null);
      setQuotaLimitReached(false);
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
        await submitJob(scene.sceneId, options);
        await fetchScenes(true);
      } catch (err) {
        console.error("[useScenesDashboardGrid] submit failed", err);
        if (isQuotaExceededError(err)) {
          // TODO(analytics): route through the app's real event-tracking
          // provider once one is wired up. Logged for now so this state is
          // at least visible in the console/CloudWatch-forwarded logs.
          console.info("[analytics] quota_limit_reached", { sceneId: scene.sceneId });
          setQuotaLimitReached(true);
        } else {
          setActionError("Failed to submit scene. Please try again.");
        }
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

  /** Edit scene now navigates to the dedicated `/scenes/settings` page rather than a modal. */
  const handleEditRequest = useCallback(
    (scene: DashboardScene) => {
      const id = scene.sceneId ?? scene.id;
      if (!id) return;
      router.push(sceneSettingsUrl(id));
    },
    [router],
  );

  const toggleSceneVisibility = useCallback(
    async (scene: DashboardScene, nextVisibility: SceneVisibility) => {
      const sceneId = scene.sceneId ?? scene.id;
      const currentVisibility = scene.visibility ?? "PRIVATE";
      if (nextVisibility === currentVisibility || visibilityUpdatingId) return;

      setVisibilityUpdatingId(sceneId);
      setActionError(null);
      setScenes((prev) =>
        prev.map((s) =>
          s.id === scene.id ? { ...s, visibility: nextVisibility } : s,
        ),
      );

      try {
        const updated = await updateScene(sceneId, { visibility: nextVisibility });
        setScenes((prev) =>
          prev.map((s) =>
            s.id === scene.id
              ? { ...s, visibility: updated.visibility ?? nextVisibility }
              : s,
          ),
        );
      } catch (err) {
        console.error("[useScenesDashboardGrid] visibility update failed", err);
        setScenes((prev) =>
          prev.map((s) =>
            s.id === scene.id ? { ...s, visibility: currentVisibility } : s,
          ),
        );
        if (err instanceof ApiRequestError && err.statusCode === 409) {
          setActionError("This scene was just updated — please try again.");
        } else {
          setActionError(
            err instanceof ApiRequestError
              ? err.message
              : "Failed to update scene visibility. Please try again.",
          );
        }
        await fetchScenes(true);
      } finally {
        setVisibilityUpdatingId(null);
      }
    },
    [fetchScenes, visibilityUpdatingId],
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
    totalCount: scenes.length,
    loading,
    error,
    sortBy,
    setSortBy,
    sortOpen,
    setSortOpen,
    sortOptions: SORT_OPTIONS,
    statusFilter,
    setStatusFilter,
    statusOpen,
    setStatusOpen,
    viewMode,
    setViewMode,
    actionError,
    actionMessage,
    quotaLimitReached,
    submittingId,
    cancellingId,
    modalCancelling,
    fetchScenes,
    openScene,
    submitScene,
    cancelScene,
    handleCancelFromModal,
    createScene,
    clearActionError: () => {
      setActionError(null);
      setQuotaLimitReached(false);
    },
    clearActionMessage: () => setActionMessage(null),
    deleteTarget,
    deleting,
    deleteError,
    remove: handleDeleteRequest,
    edit: handleEditRequest,
    visibilityUpdatingId,
    toggleSceneVisibility,
    dismissDeleteModal,
    confirmDelete,
  };
}
