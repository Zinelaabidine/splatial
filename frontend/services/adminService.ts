"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  AdminAttemptsResponse,
  AdminAsgConfigResponse,
  UpdateAsgConfigPayload,
  UpdateAsgConfigResponse,
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

/**
 * GET /admin/asg-config — read the live GPU worker ASG / launch template
 * state (current AMI, instance type, capacity, and recent version history).
 */
export async function getAsgConfig(
  signal?: AbortSignal,
): Promise<AdminAsgConfigResponse> {
  return authenticatedFetch("/admin/asg-config", {
    signal,
  }) as Promise<AdminAsgConfigResponse>;
}

/**
 * POST /admin/asg-config — update the worker AMI / instance type / ASG max
 * size at runtime. No Terraform apply or deploy required; takes effect on
 * the next scale-out.
 */
export async function updateAsgConfig(
  payload: UpdateAsgConfigPayload,
): Promise<UpdateAsgConfigResponse> {
  return authenticatedFetch("/admin/asg-config", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<UpdateAsgConfigResponse>;
}
