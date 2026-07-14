"use client";

import { authenticatedFetch } from "@/services/apiClient";
import { invalidateScenesCache } from "@/services/scenesService";
import type {
  CancelJobResponse,
  ColmapConfig,
  SubmitJobResponse,
  TrainConfig,
} from "@/types/api";

export interface SubmitJobOptions {
  trainConfig?: TrainConfig;
  colmapConfig?: ColmapConfig;
}

export async function submitJob(
  sceneId: string,
  options?: SubmitJobOptions,
  signal?: AbortSignal,
): Promise<SubmitJobResponse> {
  const result = (await authenticatedFetch("/jobs/submit", {
    method: "POST",
    body: JSON.stringify({
      sceneId,
      ...(options?.trainConfig ? { trainConfig: options.trainConfig } : {}),
      ...(options?.colmapConfig ? { colmapConfig: options.colmapConfig } : {}),
    }),
    signal,
  })) as SubmitJobResponse;
  invalidateScenesCache();
  return result;
}

export async function cancelJob(
  sceneId: string,
  signal?: AbortSignal,
): Promise<CancelJobResponse> {
  const result = (await authenticatedFetch(`/jobs/${sceneId}/cancel`, {
    method: "POST",
    signal,
  })) as CancelJobResponse;
  invalidateScenesCache();
  return result;
}
