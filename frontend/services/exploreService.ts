"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { ExploreResponse } from "@/types/api";

export type GetExploreParams = {
  cursor?: string;
  category?: string;
  tag?: string;
};

export async function getExplore(
  params?: GetExploreParams,
  signal?: AbortSignal,
): Promise<ExploreResponse> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.category) search.set("category", params.category);
  if (params?.tag) search.set("tag", params.tag);
  const qs = search.toString();
  const path = qs ? `/api/v1/explore?${qs}` : "/api/v1/explore";
  return authenticatedFetch(path, { signal }) as Promise<ExploreResponse>;
}
