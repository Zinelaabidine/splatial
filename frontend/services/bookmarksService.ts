"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { BookmarksResponse } from "@/types/api";

export async function addBookmark(
  sceneId: string,
  signal?: AbortSignal,
): Promise<{ bookmarked: true }> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/bookmark`, {
    method: "PUT",
    signal,
  }) as Promise<{ bookmarked: true }>;
}

export async function removeBookmark(
  sceneId: string,
  signal?: AbortSignal,
): Promise<{ bookmarked: false }> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/bookmark`, {
    method: "DELETE",
    signal,
  }) as Promise<{ bookmarked: false }>;
}

export async function getBookmarks(
  cursor?: string,
  signal?: AbortSignal,
): Promise<BookmarksResponse> {
  const base = "/api/v1/bookmarks";
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<BookmarksResponse>;
}
