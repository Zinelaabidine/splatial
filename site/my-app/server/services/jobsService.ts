"use client";

import { authenticatedFetch } from "@/server/services/apiClient";

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
): Promise<void> {
  await authenticatedFetch(`/jobs/${sceneId}/cancel`, {
    method: "POST",
    signal,
  });
}
