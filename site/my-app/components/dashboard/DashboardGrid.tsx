"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
            : "preprocessing"; // PENDING_UPLOAD | UPLOADED | QUEUED

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
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchScenes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data: ListScenesV1Response = await authenticatedFetch("/api/v1/scenes");
      setScenes((data.scenes ?? []).map(apiSceneToCard));
    } catch (err) {
      console.error("[DashboardGrid] fetch failed", err);
      setError("Failed to load scenes. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchScenes();
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
        router.push(`/scenes/${scene.sceneId}/view`);
      }
    },
    [router],
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
            <SceneCard key={scene.id} scene={scene} onViewScene={handleViewScene} />
          ))}
        </div>
      )}
    </div>
  );
}
