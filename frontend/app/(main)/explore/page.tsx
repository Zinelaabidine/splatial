"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import PublicSceneCardGrid from "@/components/splatworks/PublicSceneCardGrid";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { SCENE_CATEGORIES, isSceneCategory } from "@/lib/scenes/categories";
import { feedSceneToListItem, type PublicSceneListItem } from "@/lib/scenes/feedSceneMappers";
import { sceneViewerUrl } from "@/lib/scenes/viewerUrls";
import { cn } from "@/lib/utils";
import { getExplore } from "@/services/exploreService";
import type { DashboardScene } from "@/types/splatworks";

function buildExplorePath(category: string | null, tag: string | null): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (tag) params.set("tag", tag);
  const qs = params.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

function exploreEmptyMessage(category: string | null, tag: string | null): string {
  if (category && tag) {
    return `No public scenes in ${category} tagged "${tag}" yet.`;
  }
  if (category) {
    return `No public scenes in ${category} yet.`;
  }
  if (tag) {
    return `No public scenes tagged "${tag}" yet.`;
  }
  return "No public scenes yet — check back soon as creators publish their work.";
}

export default function ExplorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category");
  const activeCategory =
    rawCategory && isSceneCategory(rawCategory) ? rawCategory : null;
  const activeTag = searchParams.get("tag")?.trim() || null;

  const [items, setItems] = useState<PublicSceneListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const exploreFilters = useMemo(
    () => ({
      ...(activeCategory ? { category: activeCategory } : {}),
      ...(activeTag ? { tag: activeTag } : {}),
    }),
    [activeCategory, activeTag],
  );

  const fetchExplore = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      setLoadMoreError(null);
      setItems([]);
      setNextCursor(undefined);

      try {
        const res = await getExplore(exploreFilters, signal);
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
              : "Failed to load explore";
        setError(message);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [exploreFilters],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchExplore(controller.signal);
    return () => controller.abort();
  }, [fetchExplore]);

  const setCategoryFilter = useCallback(
    (category: string | null) => {
      router.replace(buildExplorePath(category, activeTag));
    },
    [activeTag, router],
  );

  const clearTagFilter = useCallback(() => {
    router.replace(buildExplorePath(activeCategory, null));
  }, [activeCategory, router]);

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
      const res = await getExplore({ ...exploreFilters, cursor: nextCursor });
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
  }, [exploreFilters, nextCursor, loadingMore]);

  const emptyMessage = exploreEmptyMessage(activeCategory, activeTag);

  const filterBar = (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[#737373]">
          Category
        </span>
        <button
          type="button"
          onClick={() => setCategoryFilter(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeCategory === null
              ? "bg-white text-black"
              : "bg-[#303030] text-[#d4d4d4] hover:bg-[#363636] hover:text-white",
          )}
        >
          All
        </button>
        {SCENE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeCategory === cat
                ? "bg-violet-600 text-white"
                : "bg-[#303030] text-[#d4d4d4] hover:bg-[#363636] hover:text-white",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {activeTag ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[#737373]">
            Tag
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#303030] px-2.5 py-1 text-xs text-[#e5e5e5] ring-1 ring-[#404040]">
            #{activeTag}
            <button
              type="button"
              aria-label="Clear tag filter"
              onClick={clearTagFilter}
              className="rounded p-0.5 text-[#909090] transition-colors hover:bg-[#404040] hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Explore</h1>
        {filterBar}
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
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Explore</h1>
        {filterBar}
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void fetchExplore(controller.signal);
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
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Explore</h1>
      {filterBar}

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
        <p className="py-16 text-center text-sm text-[#909090]">{emptyMessage}</p>
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
