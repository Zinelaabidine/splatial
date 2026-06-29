"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { Tour, TourItem, ToursResponse } from "@/types/api";

export const MIN_TOUR_ITEMS = 2;
export const MAX_TOUR_ITEMS = 20;
export const MAX_TOUR_TITLE_LENGTH = 80;
export const MIN_SEGMENT_DURATION_MS = 500;
export const MAX_SEGMENT_DURATION_MS = 15000;
export const DEFAULT_SEGMENT_DURATION_MS = 3000;

export type CreateTourRequest = {
  title: string;
  segmentDurationMs?: number;
  items: TourItem[];
};

export async function createTour(
  sceneId: string,
  body: CreateTourRequest,
  signal?: AbortSignal,
): Promise<Tour> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/tours`,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    },
  ) as Promise<Tour>;
}

export async function listTours(
  sceneId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<ToursResponse> {
  const base = `/api/v1/scenes/${encodeURIComponent(sceneId)}/tours`;
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<ToursResponse>;
}

export async function getTour(
  sceneId: string,
  tourId: string,
  signal?: AbortSignal,
): Promise<Tour> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/tours/${encodeURIComponent(tourId)}`,
    { signal },
  ) as Promise<Tour>;
}

export async function deleteTour(
  sceneId: string,
  tourId: string,
  signal?: AbortSignal,
): Promise<{ ok: true }> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/tours/${encodeURIComponent(tourId)}`,
    {
      method: "DELETE",
      signal,
    },
  ) as Promise<{ ok: true }>;
}
