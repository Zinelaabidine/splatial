"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  ActivateWorkerAmiResponse,
  AdminAttemptsResponse,
  AdminAsgConfigResponse,
  BootWorkerAmiResponse,
  BootWorkerPayload,
  BootWorkerResponse,
  RegisterWorkerAmiRequest,
  ReleaseWorkerResponse,
  SpotPriceResponse,
  UpdateAsgConfigPayload,
  UpdateAsgConfigResponse,
  WorkerAmi,
  WorkerAmisResponse,
  WorkerPool,
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
 * GET /admin/asg-config?pool=standard|priority — read the live GPU worker
 * ASG / launch template state (current AMI, instance type, capacity, and
 * recent version history) for the given pool. Defaults to "standard".
 */
export async function getAsgConfig(
  pool: WorkerPool = "standard",
  signal?: AbortSignal,
): Promise<AdminAsgConfigResponse> {
  const qs = new URLSearchParams({ pool }).toString();
  return authenticatedFetch(`/admin/asg-config?${qs}`, {
    signal,
  }) as Promise<AdminAsgConfigResponse>;
}

/**
 * POST /admin/asg-config — update the worker AMI / instance type / ASG max
 * size at runtime. No Terraform apply or deploy required; takes effect on
 * the next scale-out. Include `pool` in the payload to target the priority
 * pool; omitted defaults to "standard".
 */
export async function updateAsgConfig(
  payload: UpdateAsgConfigPayload,
): Promise<UpdateAsgConfigResponse> {
  return authenticatedFetch("/admin/asg-config", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<UpdateAsgConfigResponse>;
}

/**
 * POST /admin/asg/boot — force the worker ASG's desired capacity up right
 * now (e.g. to smoke-test a newly-selected AMI) instead of waiting for a
 * real SQS job. Suspends SQS-driven scaling until /admin/asg/release is
 * called — the caller is responsible for surfacing that clearly. Include
 * `pool` in the payload to target the priority pool; omitted defaults to
 * "standard".
 */
export async function bootWorker(
  payload: BootWorkerPayload = {},
): Promise<BootWorkerResponse> {
  return authenticatedFetch("/admin/asg/boot", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<BootWorkerResponse>;
}

/**
 * POST /admin/asg/release — end a manual boot session: desired capacity
 * back to 0, SQS-driven scaling resumes. Defaults to the "standard" pool.
 */
export async function releaseWorker(
  pool: WorkerPool = "standard",
): Promise<ReleaseWorkerResponse> {
  return authenticatedFetch("/admin/asg/release", {
    method: "POST",
    body: JSON.stringify({ pool }),
  }) as Promise<ReleaseWorkerResponse>;
}

/**
 * GET /admin/asg/spot-price?instanceType=... — last-hour Spot price per AZ,
 * for context before applying an instance type change or booting a worker.
 */
export async function getSpotPrice(
  instanceType: string,
  signal?: AbortSignal,
): Promise<SpotPriceResponse> {
  const qs = new URLSearchParams({ instanceType }).toString();
  return authenticatedFetch(`/admin/asg/spot-price?${qs}`, {
    signal,
  }) as Promise<SpotPriceResponse>;
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
