"use client";

import { authenticatedFetch } from "@/services/apiClient";
import { commentReactionPath } from "@/lib/api/commentPaths";
import type { ReactionSummary, ReactionType } from "@/types/api";

export async function setReaction(
  sceneId: string,
  type: ReactionType,
  signal?: AbortSignal,
): Promise<ReactionSummary> {
  return authenticatedFetch(`/api/v1/scenes/${encodeURIComponent(sceneId)}/reaction`, {
    method: "PUT",
    body: JSON.stringify({ type }),
    signal,
  }) as Promise<ReactionSummary>;
}

export async function removeReaction(
  sceneId: string,
  signal?: AbortSignal,
): Promise<ReactionSummary> {
  return authenticatedFetch(`/api/v1/scenes/${encodeURIComponent(sceneId)}/reaction`, {
    method: "DELETE",
    signal,
  }) as Promise<ReactionSummary>;
}

export async function setCommentReaction(
  sceneId: string,
  commentId: string,
  type: ReactionType,
  signal?: AbortSignal,
): Promise<ReactionSummary> {
  return authenticatedFetch(commentReactionPath(sceneId, commentId), {
    method: "PUT",
    body: JSON.stringify({ type }),
    signal,
  }) as Promise<ReactionSummary>;
}

export async function removeCommentReaction(
  sceneId: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<ReactionSummary> {
  return authenticatedFetch(commentReactionPath(sceneId, commentId), {
    method: "DELETE",
    signal,
  }) as Promise<ReactionSummary>;
}
