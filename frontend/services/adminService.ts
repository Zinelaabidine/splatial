"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  ActivateWorkerAmiResponse,
  AdminAttemptsResponse,
  BootWorkerAmiResponse,
  RegisterWorkerAmiRequest,
  WorkerAmi,
  WorkerAmisResponse,
} from "@/types/admin";

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

/** GET /admin/worker-amis */
export async function listWorkerAmis(
  signal?: AbortSignal,
): Promise<WorkerAmisResponse> {
  return authenticatedFetch("/admin/worker-amis", { signal }) as Promise<WorkerAmisResponse>;
}

/** POST /admin/worker-amis — "Register a new AMI" */
export async function registerWorkerAmi(
  body: RegisterWorkerAmiRequest,
): Promise<WorkerAmi> {
  return authenticatedFetch("/admin/worker-amis", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<WorkerAmi>;
}

/** POST /admin/worker-amis/{amiId}/boot — "Manual worker boot" */
export async function bootWorkerAmi(
  amiId: string,
): Promise<BootWorkerAmiResponse> {
  return authenticatedFetch(`/admin/worker-amis/${encodeURIComponent(amiId)}/boot`, {
    method: "POST",
  }) as Promise<BootWorkerAmiResponse>;
}

/** POST /admin/worker-amis/{amiId}/activate — "Update configuration" */
export async function activateWorkerAmi(
  amiId: string,
): Promise<ActivateWorkerAmiResponse> {
  return authenticatedFetch(`/admin/worker-amis/${encodeURIComponent(amiId)}/activate`, {
    method: "POST",
  }) as Promise<ActivateWorkerAmiResponse>;
}
