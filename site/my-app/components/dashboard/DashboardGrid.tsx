"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw } from "lucide-react";

import SceneCard from "@/components/dashboard/SceneCard";
import { authenticatedFetch } from "@/utils/apiClient";
import type { MockScene, SortOption } from "@/types/dashboard";
import type { ListScenesV1Response, Scene } from "@/types/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic pastel hue derived from a scene ID string. */
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Map API Scene → UI card model. */
function apiSceneToCard(scene: Scene): MockScene {
  const state =
    scene.status === "READY"
      ? "complete"
      : scene.status === "PROCESSING"
        ? "processing"
        : scene.status === "FAILED"
          ? "failed"
          : scene.status === "CANCELLED"
            ? "draft"
            : scene.status === "UPLOADED"
              ? "uploaded"
              : "preprocessing"; // PENDING_UPLOAD | QUEUED

  return {
    id: scene.sceneId,
    sceneId: scene.sceneId,
    title: scene.name,
    state,
    createdAt: formatDate(scene.createdAt),
    lastModified: formatDate(scene.createdAt),
    thumbnailHue:
      state === "complete" || state === "processing"
        ? hueFromId(scene.sceneId)
        : undefined,
  };
}

// ── Sort ──────────────────────────────────────────────────────────────────────

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  oldest: "Oldest",
  name: "Name",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardGrid() {
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
    // Cancel any previous in-flight request
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    if (!silent) setLoading(true);
    setError(null);
    try {
      const data: ListScenesV1Response = await authenticatedFetch("/api/v1/scenes", { signal: ctrl.signal });
      setScenes((data.scenes ?? []).map(apiSceneToCard));
    } catch (err) {
      if (ctrl.signal.aborted) return; // Navigated away — silently discard
      console.error("[DashboardGrid] fetch failed", err);
      setError("Failed to load scenes. Please try again.");
    } finally {
      if (!ctrl.signal.aborted) {
        if (!silent) setLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchScenes();
    return () => abortCtrlRef.current?.abort();
  }, [fetchScenes]);

  // Auto-poll while any scene is in-flight
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

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.sceneId) return;
    setDeleting(true);
    try {
      await authenticatedFetch(`/api/v1/scenes/${deleteTarget.sceneId}`, { method: "DELETE" });
      setScenes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("[DashboardGrid] delete failed", err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleSubmitScene = useCallback(
    async (scene: MockScene) => {
      if (!scene.sceneId) return;
      // Optimistically flip to preprocessing for instant feedback
      setScenes((prev) =>
        prev.map((s) =>
          s.id === scene.id ? { ...s, state: "preprocessing" as const } : s,
        ),
      );
      try {
        await authenticatedFetch("/jobs/submit", {
          method: "POST",
          body: JSON.stringify({ sceneId: scene.sceneId }),
        });
        fetchScenes(true);
      } catch (err) {
        console.error("[DashboardGrid] submit failed", err);
        // Revert on error
        setScenes((prev) =>
          prev.map((s) =>
            s.id === scene.id ? { ...s, state: "uploaded" as const } : s,
          ),
        );
      }
    },
    [fetchScenes],
  );

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            My Scenes{!loading && ` (${scenes.length})`}
          </h1>
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
          >
            Sort by: {SORT_LABELS[sortBy]}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {sortOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSortBy(option);
                    setSortOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
          {error}{" "}
          <button
            type="button"
            onClick={() => fetchScenes()}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-sm text-gray-500">
            No scenes yet.{" "}
            <span className="text-gray-400">
              Click{" "}
              <span className="font-medium text-purple-600">+ Create</span>{" "}
              to upload your first scene.
            </span>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((scene) => (
            <SceneCard key={scene.id} scene={scene} onViewScene={handleViewScene} onSubmitScene={handleSubmitScene} onDeleteScene={handleDeleteScene} />
          ))}
        </div>
      )}
    </div>

    {/* Delete confirmation modal */}
    {deleteTarget && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={() => !deleting && setDeleteTarget(null)}
      >
        <div
          className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Delete scene</h2>
              <p className="mt-1 text-sm text-gray-500">
                Are you sure you want to delete{" "}
                <span className="font-medium text-gray-700">&ldquo;{deleteTarget.title}&rdquo;</span>? This will
                permanently remove the scene and its uploaded files. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={confirmDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
