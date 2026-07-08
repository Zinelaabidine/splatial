"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  AdminUserDetail,
  AdminUsersListResponse,
  AssignRolesPayload,
  AssignRolesResponse,
  AuditLogsResponse,
  ChangePlanPayload,
  ChangePlanResponse,
  HardDeletePayload,
  HardDeleteResponse,
  ListAdminUsersParams,
  ListAuditLogsParams,
  ResetPasswordResponse,
  RevokeSessionsResponse,
  SoftDeletePayload,
  SoftDeleteResponse,
  UpdateUserStatusPayload,
  UpdateUserStatusResponse,
  VerifyOverridePayload,
  VerifyOverrideResponse,
} from "@/types/adminUsers";

/** GET /admin/users — searchable/filterable/sortable/paginated user directory. */
export async function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<AdminUsersListResponse> {
  const q = new URLSearchParams();
  if (params.email) q.set("email", params.email);
  if (params.status) q.set("status", params.status);
  if (params.tier) q.set("tier", params.tier);
  if (params.role) q.set("role", params.role);
  if (params.joinedFrom) q.set("joinedFrom", params.joinedFrom);
  if (params.joinedTo) q.set("joinedTo", params.joinedTo);
  if (params.sort) q.set("sort", params.sort);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return authenticatedFetch(`/admin/users${qs ? `?${qs}` : ""}`, {
    signal: params.signal,
  }) as Promise<AdminUsersListResponse>;
}

/** GET /admin/users/{userId} — full detail view. */
export async function getAdminUser(userId: string, signal?: AbortSignal): Promise<AdminUserDetail> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}`, {
    signal,
  }) as Promise<AdminUserDetail>;
}

/** POST /admin/users/{userId}/status — suspend / ban / reactivate. */
export async function updateUserStatus(
  userId: string,
  payload: UpdateUserStatusPayload,
): Promise<UpdateUserStatusResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<UpdateUserStatusResponse>;
}

/** POST /admin/users/{userId}/verify-override — manual email/phone verification override. */
export async function setVerificationOverride(
  userId: string,
  payload: VerifyOverridePayload,
): Promise<VerifyOverrideResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/verify-override`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<VerifyOverrideResponse>;
}

/** POST /admin/users/{userId}/reset-password — trigger a forced password reset. */
export async function triggerPasswordReset(
  userId: string,
  reason?: string,
): Promise<ResetPasswordResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }) as Promise<ResetPasswordResponse>;
}

/** POST /admin/users/{userId}/revoke-sessions — force logout everywhere. */
export async function revokeUserSessions(
  userId: string,
  reason: string,
): Promise<RevokeSessionsResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }) as Promise<RevokeSessionsResponse>;
}

/** POST /admin/users/{userId}/soft-delete — disable access, preserve data + auditability. */
export async function softDeleteUser(
  userId: string,
  payload: SoftDeletePayload,
): Promise<SoftDeleteResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/soft-delete`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<SoftDeleteResponse>;
}

/**
 * POST /admin/users/{userId}/hard-delete — irreversible. Requires typed
 * confirmation: `confirmUserId` must exactly equal `userId`.
 */
export async function hardDeleteUser(
  userId: string,
  payload: HardDeletePayload,
): Promise<HardDeleteResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/hard-delete`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<HardDeleteResponse>;
}

/** POST /admin/users/{userId}/roles — replace the user's assignable role set. */
export async function assignUserRoles(
  userId: string,
  payload: AssignRolesPayload,
): Promise<AssignRolesResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<AssignRolesResponse>;
}

/** POST /admin/users/{userId}/plan — change subscription tier. */
export async function changeUserPlan(
  userId: string,
  payload: ChangePlanPayload,
): Promise<ChangePlanResponse> {
  return authenticatedFetch(`/admin/users/${encodeURIComponent(userId)}/plan`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<ChangePlanResponse>;
}

/** GET /admin/audit-logs — global audit trail (optionally scoped to a user or actor). */
export async function listAuditLogs(params: ListAuditLogsParams = {}): Promise<AuditLogsResponse> {
  const q = new URLSearchParams();
  if (params.targetUserId) q.set("targetUserId", params.targetUserId);
  if (params.actorAdminId) q.set("actorAdminId", params.actorAdminId);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return authenticatedFetch(`/admin/audit-logs${qs ? `?${qs}` : ""}`, {
    signal: params.signal,
  }) as Promise<AuditLogsResponse>;
}
