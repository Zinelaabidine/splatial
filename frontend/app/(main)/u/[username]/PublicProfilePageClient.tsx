"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import PublicSceneCard from "@/components/splatworks/PublicSceneCard";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { apiSceneToDashboardScene } from "@/lib/scenes/sceneMappers";
import {
  followUser,
  getProfileByUsername,
  getProfileScenes,
  unfollowUser,
} from "@/services/profileService";
import type { Profile } from "@/types/api";
import type { DashboardScene } from "@/types/splatworks";

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export default function PublicProfilePageClient() {
  const params = useParams();
  const router = useRouter();
  const rawUsername = params.username;
  let username =
    typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  if (username === "__placeholder__" && typeof window !== "undefined") {
    const fromPath = window.location.pathname.split("/u/")[1]?.split("/")[0];
    if (fromPath) username = fromPath.trim().toLowerCase();
  }

  const [profile, setProfile] = useState<Profile | null>(null);
  const [scenes, setScenes] = useState<DashboardScene[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenesError, setScenesError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const fetchProfileAndScenes = useCallback(async (signal: AbortSignal) => {
    if (!username) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setError(null);
    setScenesError(null);
    setProfile(null);
    setScenes([]);
    setNextCursor(undefined);

    try {
      const [loadedProfile, scenesRes] = await Promise.all([
        getProfileByUsername(username, signal),
        getProfileScenes(username, undefined, signal),
      ]);
      if (signal.aborted) return;
      setProfile(loadedProfile);
      setScenes((scenesRes.scenes ?? []).map(apiSceneToDashboardScene));
      setNextCursor(scenesRes.nextCursor);
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof ApiRequestError && err.statusCode === 404) {
        setNotFound(true);
        return;
      }
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load profile";
      setError(message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProfileAndScenes(controller.signal);
    return () => controller.abort();
  }, [fetchProfileAndScenes]);

  const openScene = useCallback(
    (scene: DashboardScene) => {
      if (scene.status === "completed" && scene.sceneId) {
        router.push(`/scenes/view?id=${scene.sceneId}`);
      }
    },
    [router],
  );

  const handleFollowToggle = useCallback(async () => {
    if (!profile || profile.isSelf || followBusy) return;

    const handle = profile.username ?? username;
    if (!handle) return;

    const prevFollowing = profile.isFollowing ?? false;
    const prevFollowersCount = profile.followersCount;
    const nextFollowing = !prevFollowing;

    setFollowBusy(true);
    setFollowError(null);
    setProfile((current) =>
      current
        ? {
            ...current,
            isFollowing: nextFollowing,
            followersCount: Math.max(
              0,
              current.followersCount + (nextFollowing ? 1 : -1),
            ),
          }
        : current,
    );

    try {
      const result = nextFollowing
        ? await followUser(handle)
        : await unfollowUser(handle);
      setProfile((current) =>
        current
          ? {
              ...current,
              isFollowing: result.following,
              followersCount: result.followersCount,
            }
          : current,
      );
    } catch (err) {
      setProfile((current) =>
        current
          ? {
              ...current,
              isFollowing: prevFollowing,
              followersCount: prevFollowersCount,
            }
          : current,
      );
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to update follow status";
      setFollowError(message);
    } finally {
      setFollowBusy(false);
    }
  }, [profile, username, followBusy]);

  const loadMore = useCallback(async () => {
    if (!username || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setScenesError(null);
    try {
      const res = await getProfileScenes(username, nextCursor);
      setScenes((prev) => [
        ...prev,
        ...(res.scenes ?? []).map(apiSceneToDashboardScene),
      ]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load more scenes";
      setScenesError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [username, nextCursor, loadingMore]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-8 flex animate-pulse items-start gap-5">
          <div className="h-20 w-20 shrink-0 rounded-full bg-[#2a2a2a]" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-7 w-48 rounded bg-[#2a2a2a]" />
            <div className="h-4 w-32 rounded bg-[#252525]" />
            <div className="h-4 w-full max-w-md rounded bg-[#252525]" />
            <div className="h-3 w-56 rounded bg-[#252525]" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-[1400px] py-16 text-center">
        <p className="text-lg font-medium text-white">Profile not found</p>
        <p className="mt-2 text-sm text-[#909090]">
          This username does not exist or is not available.
        </p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {error ?? "Failed to load profile."}{" "}
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void fetchProfileAndScenes(controller.signal);
            }}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handle = profile.username ?? username;
  const initials = initialsFromDisplayName(profile.displayName);
  const isFollowing = profile.isFollowing ?? false;
  const showFollowButton = profile.isSelf !== true;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
          {profile.avatarUrl ? (
            <>
              {/* Presigned S3 URLs — not compatible with next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            </>
          ) : (
            <UserAvatar initials={initials} size={80} />
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {profile.displayName}
            </h1>
            <p className="mt-1 font-sw-mono text-sm text-[#909090]">@{handle}</p>
            {profile.bio.trim() !== "" && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#c8c8c8]">
                {profile.bio}
              </p>
            )}
            <p className="mt-3 text-sm text-[#909090]">
              <span className="font-medium text-[#e8e8e8]">
                {formatCount(profile.followersCount)}
              </span>{" "}
              followers
              <span className="mx-2 text-[#505050]">·</span>
              <span className="font-medium text-[#e8e8e8]">
                {formatCount(profile.followingCount)}
              </span>{" "}
              following
              <span className="mx-2 text-[#505050]">·</span>
              <span className="font-medium text-[#e8e8e8]">
                {formatCount(profile.scenesCount)}
              </span>{" "}
              scenes
            </p>
          </div>
        </div>

        {showFollowButton ? (
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <Button
              type="button"
              variant={isFollowing ? "outline" : "default"}
              disabled={followBusy}
              onClick={() => void handleFollowToggle()}
            >
              {followBusy ? (
                <>
                  <Loader2 className="animate-spin" />
                  {isFollowing ? "Following…" : "Follow…"}
                </>
              ) : isFollowing ? (
                "Following"
              ) : (
                "Follow"
              )}
            </Button>
            {followError ? (
              <p className="max-w-xs text-xs text-red-400">{followError}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      <h2 className="mb-4 text-lg font-semibold text-white">Public scenes</h2>

      {scenesError ? (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {scenesError}{" "}
          <button
            type="button"
            onClick={() => void loadMore()}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      ) : null}

      {scenes.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">No public scenes yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {scenes.map((scene) => (
              <PublicSceneCard key={scene.id} scene={scene} onClick={openScene} />
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
