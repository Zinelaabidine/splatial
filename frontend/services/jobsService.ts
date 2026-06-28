"use client";

import { authenticatedFetch } from "@/server/services/apiClient";
import type { CancelJobResponse } from "@/types/api";

export async function submitJob(
  sceneId: string,
  signal?: AbortSignal,
): Promise<void> {
  await authenticatedFetch("/jobs/submit", {
    method: "POST",
    body: JSON.stringify({ sceneId }),
    signal,
  });
}

export async function cancelJob(
  sceneId: string,
  signal?: AbortSignal,
): Promise<CancelJobResponse> {
  return authenticatedFetch(`/jobs/${sceneId}/cancel`, {
    method: "POST",
    signal,
  }) as Promise<CancelJobResponse>;
}
