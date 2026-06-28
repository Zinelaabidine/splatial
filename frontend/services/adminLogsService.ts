"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { AttemptLogsResponse } from "@/types/adminLogs";

export type GetAttemptLogsParams = {
  from?: number; // epoch ms
  to?: number; // epoch ms
  level?: string; // info | warning | error | debug
  limit?: number;
  nextToken?: string;
  signal?: AbortSignal;
};

/**
 * GET /admin/attempts/{attemptId}/logs — admin-only log drill-down.
 * Path doesn't start with /api/v1, so it matches the gateway route directly
 * (the dev `/api` rewrite proxies it).
 */
export async function getAttemptLogs(
  attemptId: string,
  params: GetAttemptLogsParams = {},
): Promise<AttemptLogsResponse> {
  const q = new URLSearchParams();
  if (params.from) q.set("from", String(params.from));
  if (params.to) q.set("to", String(params.to));
  if (params.level) q.set("level", params.level);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.nextToken) q.set("nextToken", params.nextToken);
  const qs = q.toString();
  const endpoint = `/admin/attempts/${encodeURIComponent(attemptId)}/logs${
    qs ? `?${qs}` : ""
  }`;
  return authenticatedFetch(endpoint, {
    signal: params.signal,
  }) as Promise<AttemptLogsResponse>;
}
