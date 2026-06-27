"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { apiSceneToSplat } from "@/lib/splatworks/splatMappers";
import { deleteScene, listScenes } from "@/server/services/scenesService";
import type { Splat, SplatsSortOption, SplatsViewMode } from "@/types/splatworks";

const SORT_OPTIONS: SplatsSortOption[] = ["newest", "oldest", "name"];

function sortSplats(list: Splat[], sortBy: SplatsSortOption): Splat[] {
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

export function useSplatsGallery(search: string) {
  const router = useRouter();
  const author = useAppAccount();
  const [splats, setSplats] = useState<Splat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SplatsSortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [viewMode, setViewMode] = useState<SplatsViewMode>("grid");
  const [deleteTarget, setDeleteTarget] = useState<Splat | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchSplats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listScenes();
      const ready = (data.scenes ?? []).filter((scene) => scene.status === "READY");
      setSplats(ready.map((scene) => apiSceneToSplat(scene, author)));
    } catch (err) {
      console.error("[useSplatsGallery] fetch failed", err);
      setError("Failed to load splats. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [author.name, author.initials]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSplats();
  }, [fetchSplats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? splats.filter((s) => s.title.toLowerCase().includes(q))
      : splats;
    return sortSplats(list, sortBy);
  }, [search, sortBy, splats]);

  const open3D = useCallback(
    (splat: Splat) => {
      const sceneId = splat.sceneId ?? splat.id;
      router.push(`/scenes/view?id=${sceneId}`);
    },
    [router],
  );

  const startTour = useCallback(
    (splat: Splat) => {
      open3D(splat);
    },
    [open3D],
  );

  const openDetail = useCallback(
    (splat: Splat) => {
      open3D(splat);
    },
    [open3D],
  );

  const download = useCallback((_splat: Splat, _format: "ply" | "splat") => {
    // TODO: presigned download URLs from API
  }, []);

  const share = useCallback((splat: Splat) => {
    const sceneId = splat.sceneId ?? splat.id;
    const url = `${window.location.origin}/scenes/view?id=${sceneId}`;
    void navigator.clipboard.writeText(url).catch(() => {
      /* clipboard may be unavailable */
    });
  }, []);

  const rename = useCallback((_splat: Splat) => {
    // TODO: rename via API
  }, []);

  const handleDeleteRequest = useCallback((splat: Splat) => {
    setDeleteError(null);
    setDeleteTarget(splat);
  }, []);

  const dismissDeleteModal = useCallback(() => {
    if (!deleting) {
      setDeleteTarget(null);
      setDeleteError(null);
    }
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const sceneId = deleteTarget.sceneId ?? deleteTarget.id;
    const splatId = deleteTarget.id;

    setDeleting(true);
    setDeleteError(null);
    setActionMessage(null);
    try {
      const result = await deleteScene(sceneId);
      setSplats((prev) => prev.filter((s) => s.id !== splatId));
      setDeleteTarget(null);
      if (result.cancelledJob) {
        setActionMessage("Processing was stopped and the splat was deleted.");
      }
    } catch (err) {
      console.error("[useSplatsGallery] delete failed", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete splat. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  return {
    splats: filtered,
    count: filtered.length,
    totalReady: splats.length,
    loading,
    error,
    sortBy,
    setSortBy,
    sortOpen,
    setSortOpen,
    sortOptions: SORT_OPTIONS,
    viewMode,
    setViewMode,
    deleteTarget,
    deleting,
    deleteError,
    actionMessage,
    clearActionMessage: () => setActionMessage(null),
    fetchSplats,
    open3D,
    startTour,
    openDetail,
    download,
    share,
    rename,
    remove: handleDeleteRequest,
    dismissDeleteModal,
    confirmDelete,
  };
}
