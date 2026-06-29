"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import PublicSceneCardGrid from "@/components/splatworks/PublicSceneCardGrid";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { feedSceneToListItem, type PublicSceneListItem } from "@/lib/scenes/feedSceneMappers";
import { sceneViewerUrl } from "@/lib/scenes/viewerUrls";
import { getBookmarks } from "@/services/bookmarksService";
import type { DashboardScene } from "@/types/splatworks";

export default function SavedPage() {
  const router = useRouter();
  const [items, setItems] = useState<PublicSceneListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setItems([]);
    setNextCursor(undefined);

    try {
      const res = await getBookmarks(undefined, signal);
      if (signal.aborted) return;
      setItems((res.scenes ?? []).map(feedSceneToListItem));
      setNextCursor(res.nextCursor);
    } catch (err) {
      if (signal.aborted) return;
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load saved scenes";
      setError(message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBookmarks(controller.signal);
    return () => controller.abort();
  }, [fetchBookmarks]);

  const openScene = useCallback(
    (scene: DashboardScene) => {
      if (scene.status === "completed" && scene.sceneId) {
        router.push(
          sceneViewerUrl(scene.sceneId, {
            forkedFromSceneId: scene.forkedFromSceneId,
            forkedFromUsername: scene.forkedFromUsername,
          }),
        );
      }
    },
    [router],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await getBookmarks(nextCursor);
      setItems((prev) => [...prev, ...(res.scenes ?? []).map(feedSceneToListItem)]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load more scenes";
      setLoadMoreError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Saved</h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Saved</h1>
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void fetchBookmarks(controller.signal);
            }}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Saved</h1>

      {loadMoreError ? (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {loadMoreError}{" "}
          <Button
            type="button"
            variant="link"
            onClick={() => void loadMore()}
            className="h-auto p-0 text-red-300 underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">
          No saved scenes yet — tap the bookmark on a scene to save it.
        </p>
      ) : (
        <PublicSceneCardGrid
          items={items}
          onSceneClick={openScene}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
        />
      )}
    </div>
  );
}
