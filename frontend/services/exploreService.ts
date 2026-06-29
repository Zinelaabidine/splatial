"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { ExploreResponse } from "@/types/api";

export async function getExplore(
  cursor?: string,
  signal?: AbortSignal,
): Promise<ExploreResponse> {
  const base = "/api/v1/explore";
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<ExploreResponse>;
}
