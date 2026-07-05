"use client";

import { authenticatedFetch } from "@/services/apiClient";
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
  return authenticatedFetch("/jobs/submit", {
    method: "POST",
    body: JSON.stringify({
      sceneId,
      ...(options?.trainConfig ? { trainConfig: options.trainConfig } : {}),
      ...(options?.colmapConfig ? { colmapConfig: options.colmapConfig } : {}),
    }),
    signal,
  }) as Promise<SubmitJobResponse>;
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
