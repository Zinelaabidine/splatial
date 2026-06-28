"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { AdminAttemptsResponse } from "@/types/admin";

export type ListAttemptsParams = {
  status?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

/**
 * GET /admin/attempts — admin-only operations overview.
 *
 * The endpoint path intentionally does NOT start with `/api/v1`; it matches the
 * gateway route `GET /admin/attempts`. In dev, getApiBaseUrl() prefixes `/api`
 * and the Next.js rewrite proxies it to the API gateway.
 */
export async function listAdminAttempts(
  params: ListAttemptsParams = {},
): Promise<AdminAttemptsResponse> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  const endpoint = `/admin/attempts${qs ? `?${qs}` : ""}`;
  return authenticatedFetch(endpoint, {
    signal: params.signal,
  }) as Promise<AdminAttemptsResponse>;
}
