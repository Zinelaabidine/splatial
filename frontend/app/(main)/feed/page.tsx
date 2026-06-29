"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import PublicSceneCard from "@/components/splatworks/PublicSceneCard";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { apiSceneToDashboardScene } from "@/lib/scenes/sceneMappers";
import { getFeed } from "@/services/feedService";
import type { FeedScene } from "@/types/api";
import type { DashboardScene } from "@/types/splatworks";

type FeedItem = {
  scene: DashboardScene;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string | null;
};

function feedSceneToItem(feedScene: FeedScene): FeedItem {
  return {
    scene: apiSceneToDashboardScene(feedScene),
    ownerUsername: feedScene.ownerUsername,
    ownerDisplayName: feedScene.ownerDisplayName,
    ownerAvatarUrl: feedScene.ownerAvatarUrl,
  };
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

function FeedAuthorRow({
  ownerUsername,
  ownerDisplayName,
  ownerAvatarUrl,
}: {
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string | null;
}) {
  const handle = ownerUsername.trim().toLowerCase();
  const initials = initialsFromDisplayName(ownerDisplayName || ownerUsername);

  if (!handle) {
    return (
      <div className="mb-3 flex items-center gap-2.5">
        <UserAvatar initials={initials} size={32} />
        <span className="truncate text-sm font-medium text-white">
          {ownerDisplayName || "Unknown creator"}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={`/u/${encodeURIComponent(handle)}`}
      onClick={(e) => e.stopPropagation()}
      className="mb-3 flex items-center gap-2.5 rounded-lg transition-colors hover:bg-[#2a2a2a]/60"
    >
      {ownerAvatarUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ownerAvatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        </>
      ) : (
        <UserAvatar initials={initials} size={32} />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">
          {ownerDisplayName || handle}
        </p>
        <p className="font-sw-mono truncate text-xs text-[#909090]">@{handle}</p>
      </div>
    </Link>
  );
}

export default function FeedPage() {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const fetchFeed = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setItems([]);
    setNextCursor(undefined);

    try {
      const res = await getFeed(undefined, signal);
      if (signal.aborted) return;
      setItems((res.scenes ?? []).map(feedSceneToItem));
      setNextCursor(res.nextCursor);
    } catch (err) {
      if (signal.aborted) return;
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load feed";
      setError(message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFeed(controller.signal);
    return () => controller.abort();
  }, [fetchFeed]);

  const openScene = useCallback(
    (scene: DashboardScene) => {
      if (scene.status === "completed" && scene.sceneId) {
        router.push(`/scenes/view?id=${scene.sceneId}`);
      }
    },
    [router],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await getFeed(nextCursor);
      setItems((prev) => [...prev, ...(res.scenes ?? []).map(feedSceneToItem)]);
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
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Feed</h1>
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
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Feed</h1>
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void fetchFeed(controller.signal);
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
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">Feed</h1>

      {loadMoreError ? (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {loadMoreError}{" "}
          <button
            type="button"
            onClick={() => void loadMore()}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">
          Your feed is empty — follow some creators to see their scenes here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <div key={item.scene.id}>
                <FeedAuthorRow
                  ownerUsername={item.ownerUsername}
                  ownerDisplayName={item.ownerDisplayName}
                  ownerAvatarUrl={item.ownerAvatarUrl}
                />
                <PublicSceneCard scene={item.scene} onClick={openScene} />
              </div>
            ))}
          </div>

          {nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
