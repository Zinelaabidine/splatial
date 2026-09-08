"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { UserAvatar } from "@/components/splatial/SplatialLogo";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { usePresence } from "@/hooks/viewer/usePresence";
import { followUser, getProfileByUsername, unfollowUser } from "@/services/profileService";
import { cn } from "@/lib/utils";

type SceneInfoCardProps = {
  sceneId?: string;
  sceneName?: string;
  ownerUsername?: string;
  ownerDisplayName?: string;
  /** Hide the Follow button on the owner's own scene. */
  isSceneOwner?: boolean;
  className?: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

/**
 * Top-left identity overlay: scene title, creator, and a Follow action.
 *
 * The old viewer gave the scene no framing at all — no title, no creator,
 * nothing to say whose work you were looking at. `ownerUsername` /
 * `ownerDisplayName` come from the scene-status response (already
 * denormalized on the scene item); avatar, bio, and follow state come from
 * a single profile lookup once we know the handle.
 */
export default function SceneInfoCard({
  sceneId,
  sceneName,
  ownerUsername,
  ownerDisplayName,
  isSceneOwner = false,
  className,
}: SceneInfoCardProps) {
  // null when presence isn't deployed/enabled for this environment — see
  // hooks/viewer/usePresence.ts. Deliberately hidden rather than shown as 0.
  const viewerCount = usePresence(sceneId ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Only set once the profile fetch resolves — falls back to the
  // scene-status-provided ownerDisplayName until then (or forever, if the
  // fetch fails or is skipped for the scene owner's own view).
  const [fetchedDisplayName, setFetchedDisplayName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const displayName = fetchedDisplayName ?? ownerDisplayName ?? "";

  useEffect(() => {
    if (!ownerUsername || isSceneOwner) return;
    let cancelled = false;
    const ctrl = new AbortController();

    void getProfileByUsername(ownerUsername, ctrl.signal)
      .then((profile) => {
        if (cancelled) return;
        setAvatarUrl(profile.avatarUrl ?? null);
        setBio(profile.bio || null);
        if (profile.displayName) setFetchedDisplayName(profile.displayName);
        setIsFollowing(profile.isFollowing ?? false);
      })
      .catch(() => {
        /* Card still shows title/handle without the extras. */
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ownerUsername, isSceneOwner]);

  const handleToggleFollow = useCallback(async () => {
    if (!ownerUsername || pending || isFollowing === null) return;
    const previous = isFollowing;
    const next = !isFollowing;
    setIsFollowing(next);
    setPending(true);
    try {
      const result = next
        ? await followUser(ownerUsername)
        : await unfollowUser(ownerUsername);
      setIsFollowing(result.following);
    } catch (err) {
      setIsFollowing(previous);
      if (!(err instanceof ApiRequestError)) {
        console.error("[SceneInfoCard] follow toggle failed", err);
      }
    } finally {
      setPending(false);
    }
  }, [ownerUsername, pending, isFollowing]);

  if (!sceneName && !ownerUsername) return null;

  const handle = ownerUsername?.trim().toLowerCase();
  const nameForInitials = displayName || handle || "?";

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-sm flex-col gap-2 rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] px-4 py-3 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      {sceneName ? (
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-[var(--nord-ink)]">{sceneName}</h1>
          {viewerCount !== null && viewerCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--nord-tint)] px-2 py-0.5 font-sw-mono text-[10px] text-[var(--nord-ink)]">
              <span className="size-1.5 rounded-full bg-[var(--nord-success)]" aria-hidden />
              {viewerCount} watching
            </span>
          ) : null}
        </div>
      ) : null}

      {handle ? (
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <UserAvatar initials={initialsFromName(nameForInitials)} size={32} />
          )}

          <div className="min-w-0 flex-1">
            <Link
              href={`/u/${encodeURIComponent(handle)}`}
              className="block truncate text-sm font-medium text-[var(--nord-ink)] hover:underline"
            >
              {displayName || `@${handle}`}
            </Link>
            {bio ? (
              <p className="truncate text-xs text-[var(--nord-ink)]">{bio}</p>
            ) : null}
          </div>

          {!isSceneOwner && isFollowing !== null ? (
            <Button
              type="button"
              size="sm"
              variant={isFollowing ? "outline" : "default"}
              disabled={pending}
              onClick={() => void handleToggleFollow()}
              className={cn(
                "h-auto shrink-0 rounded-full px-3 py-1 text-xs",
                isFollowing
                  ? "border-[var(--nord-hairline)] bg-transparent text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]"
                  : undefined,
              )}
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : isFollowing ? (
                "Following"
              ) : (
                "Follow"
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
