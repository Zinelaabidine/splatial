"use client";

import { useEffect, useState } from "react";

import { isExpectedSceneConflict } from "@/lib/api/apiErrors";
import { normalizeReactionSummary } from "@/lib/reactions/constants";
import { mapViewUrlError } from "@/lib/viewer/viewUrlErrors";
import { getSceneStatus, getSceneViewUrl } from "@/services/scenesService";
import type { ReactionSummary } from "@/types/api";

function formatPendingStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}

export function useSceneViewUrl(sceneId: string) {
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [reactionSummary, setReactionSummary] = useState<ReactionSummary | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [commentsCount, setCommentsCount] = useState(0);
  const [sceneName, setSceneName] = useState<string | undefined>(undefined);
  const [forkedFromSceneId, setForkedFromSceneId] = useState<string | null>(null);
  const [forkedFromUsername, setForkedFromUsername] = useState<string | null>(null);
  const [forksCount, setForksCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(sceneId));

  useEffect(() => {
    if (!sceneId) return;

    let cancelled = false;
    const ctrl = new AbortController();

    void (async () => {
      setLoading(true);
      setFetchError(null);
      setSplatUrl(null);
      setReactionSummary(null);
      setIsBookmarked(false);
      setCommentsCount(0);
      setSceneName(undefined);
      setForkedFromSceneId(null);
      setForkedFromUsername(null);
      setForksCount(0);

      try {
        const scene = await getSceneStatus(sceneId, ctrl.signal);

        if (!cancelled) {
          setReactionSummary(
            normalizeReactionSummary({
              reactionCounts: scene.reactionCounts,
              reactionsTotal: scene.reactionsTotal,
              myReaction: scene.myReaction,
            }),
          );
          setCommentsCount(scene.commentsCount ?? 0);
          setIsBookmarked(scene.isBookmarked ?? false);
          if (scene.name) setSceneName(scene.name);
          if (scene.forkedFromSceneId) setForkedFromSceneId(scene.forkedFromSceneId);
          if (scene.forkedFromUsername) setForkedFromUsername(scene.forkedFromUsername);
          setForksCount(scene.forksCount ?? 0);
        }

        if (scene.status !== "READY") {
          if (!cancelled) {
            setFetchError(
              `This scene is still ${formatPendingStatus(scene.status)}. Open it again once processing finishes.`,
            );
          }
          return;
        }

        const { url } = await getSceneViewUrl(sceneId, ctrl.signal);
        if (!cancelled) setSplatUrl(url);
      } catch (err) {
        if (!cancelled) {
          if (
            !(err instanceof DOMException && err.name === "AbortError") &&
            !ctrl.signal.aborted &&
            !isExpectedSceneConflict(err)
          ) {
            console.error("[useSceneViewUrl] failed to fetch view URL", err);
          }
          setFetchError(mapViewUrlError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sceneId]);

  return {
    splatUrl: sceneId ? splatUrl : null,
    reactionSummary: sceneId ? reactionSummary : null,
    isBookmarked: sceneId ? isBookmarked : false,
    commentsCount: sceneId ? commentsCount : 0,
    setCommentsCount,
    sceneName: sceneId ? sceneName : undefined,
    forkedFromSceneId: sceneId ? forkedFromSceneId : null,
    forkedFromUsername: sceneId ? forkedFromUsername : null,
    forksCount: sceneId ? forksCount : 0,
    error: sceneId ? fetchError : "No scene selected.",
    loading: sceneId ? loading : false,
  };
}
