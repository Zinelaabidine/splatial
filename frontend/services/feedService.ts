"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { FeedResponse } from "@/types/api";

export async function getFeed(
  cursor?: string,
  signal?: AbortSignal,
): Promise<FeedResponse> {
  const base = "/api/v1/feed";
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<FeedResponse>;
}
