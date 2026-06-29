"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { ReactionSummary, ReactionType } from "@/types/api";

export async function setReaction(
  sceneId: string,
  type: ReactionType,
  signal?: AbortSignal,
): Promise<ReactionSummary> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/reaction`, {
    method: "PUT",
    body: JSON.stringify({ type }),
    signal,
  }) as Promise<ReactionSummary>;
}

export async function removeReaction(
  sceneId: string,
  signal?: AbortSignal,
): Promise<ReactionSummary> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/reaction`, {
    method: "DELETE",
    signal,
  }) as Promise<ReactionSummary>;
}
