"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { Shot, ShotsResponse } from "@/types/api";

export const MAX_SHOT_LABEL_LENGTH = 80;

export type CreateShotRequest = {
  label?: string;
  viewMatrix: number[];
};

export async function createShot(
  sceneId: string,
  body: CreateShotRequest,
  signal?: AbortSignal,
): Promise<Shot> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/shots`,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    },
  ) as Promise<Shot>;
}

export async function listShots(
  sceneId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<ShotsResponse> {
  const base = `/api/v1/scenes/${encodeURIComponent(sceneId)}/shots`;
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<ShotsResponse>;
}

export async function getShot(
  sceneId: string,
  shotId: string,
  signal?: AbortSignal,
): Promise<Shot> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/shots/${encodeURIComponent(shotId)}`,
    { signal },
  ) as Promise<Shot>;
}

export async function deleteShot(
  sceneId: string,
  shotId: string,
  signal?: AbortSignal,
): Promise<{ ok: true }> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/shots/${encodeURIComponent(shotId)}`,
    {
      method: "DELETE",
      signal,
    },
  ) as Promise<{ ok: true }>;
}
