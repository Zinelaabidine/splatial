"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import ConfirmActionDialog from "@/components/admin/ConfirmActionDialog";
import {
  assignUserRoles,
  changeUserPlan,
  getAdminUser,
  hardDeleteUser,
  revokeUserSessions,
  setVerificationOverride,
  softDeleteUser,
  triggerPasswordReset,
  updateUserStatus,
} from "@/services/adminUsersService";
import type { AdminUserDetail, AdminUserRole, AdminUserTier, UserStatusAction } from "@/types/adminUsers";
import { ApiRequestError } from "@/lib/api/apiErrors";

const ASSIGNABLE_ROLES: AdminUserRole[] = ["admin", "moderator", "beta_tester"];

type PendingAction =
  | { kind: "status"; action: UserStatusAction }
  | { kind: "soft-delete" }
  | { kind: "hard-delete" }
  | { kind: "revoke-sessions" }
  | null;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function AdminUserDetailPanel({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rolesDraft, setRolesDraft] = useState<AdminUserRole[]>([]);
  const [rolesReason, setRolesReason] = useState("");
  const [showRolesForm, setShowRolesForm] = useState(false);

  const [planDraft, setPlanDraft] = useState<AdminUserTier>("free");
  const [planReason, setPlanReason] = useState("");
  const [showPlanForm, setShowPlanForm] = useState(false);

  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [emailVerifiedDraft, setEmailVerifiedDraft] = useState(false);
  const [phoneVerifiedDraft, setPhoneVerifiedDraft] = useState(false);
  const [verifyReason, setVerifyReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getAdminUser(userId);
      setDetail(d);
      setRolesDraft(d.roles.filter((r): r is AdminUserRole => ASSIGNABLE_ROLES.includes(r as AdminUserRole)));
      setPlanDraft(d.tier);
      setEmailVerifiedDraft(d.cognito?.emailVerified ?? false);
      setPhoneVerifiedDraft(d.cognito?.phoneVerified ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function errMessage(e: unknown): string {
    if (e instanceof ApiRequestError) return e.message;
    return e instanceof Error ? e.message : "Action failed";
  }

  async function runStatusAction(action: UserStatusAction, reason: string) {
    setBusy(true);
    setActionError(null);
    try {
      await updateUserStatus(userId, { action, reason: reason || undefined });
      setPending(null);
      await load();
      onChanged();
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSoftDelete(reason: string) {
    setBusy(true);
    setActionError(null);
    try {
      await softDeleteUser(userId, { reason });
      setPending(null);
      await load();
      onChanged();
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runHardDelete(reason: string) {
    setBusy(true);
    setActionError(null);
    try {
      await hardDeleteUser(userId, { reason, confirmUserId: userId });
      setPending(null);
      onChanged();
      onClose();
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runRevokeSessions(reason: string) {
    setBusy(true);
    setActionError(null);
    try {
      await revokeUserSessions(userId, reason);
      setPending(null);
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runResetPassword() {
    setBusy(true);
    setActionError(null);
    try {
      await triggerPasswordReset(userId);
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitRoles() {
    if (!rolesReason.trim()) {
      setActionError("A reason is required to change roles.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await assignUserRoles(userId, { roles: rolesDraft, reason: rolesReason.trim() });
      setShowRolesForm(false);
      setRolesReason("");
      await load();
      onChanged();
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitPlan() {
    if (!planReason.trim()) {
      setActionError("A reason is required to change the plan.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await changeUserPlan(userId, { tier: planDraft, reason: planReason.trim() });
      setShowPlanForm(false);
      setPlanReason("");
      await load();
      onChanged();
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify() {
    setBusy(true);
    setActionError(null);
    try {
      await setVerificationOverride(userId, {
        emailVerified: emailVerifiedDraft,
        phoneVerified: phoneVerifiedDraft,
        reason: verifyReason.trim() || "Manual verification override",
      });
      setShowVerifyForm(false);
      setVerifyReason("");
      await load();
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-[#2a2a2a] bg-[#161616] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#f1f1f1]">User details</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[#909090] hover:bg-[#222]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center text-[#909090]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : error || !detail ? (
          <div className="rounded-lg border border-[#5b2626] bg-[#2a1414] px-4 py-3 text-sm text-[#f0a8a8]">
            {error ?? "User not found"}
          </div>
        ) : (
          <div className="space-y-6">
            {actionError && (
              <div className="rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-sm text-[#f0a8a8]">
                {actionError}
              </div>
            )}

            {/* Profile */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#808080]">Profile</h3>
              <p className="text-base font-medium text-[#f1f1f1]">{detail.profile.displayName || "—"}</p>
              <p className="text-sm text-[#a0a0a0]">{detail.profile.email ?? "no email on file"}</p>
              <p className="text-sm text-[#a0a0a0]">@{detail.profile.username ?? "—"}</p>
              <p className="mt-1 text-xs text-[#707070]">Joined {formatWhen(detail.profile.createdAt)}</p>
              <p className="text-xs text-[#707070]">Last profile activity {formatWhen(detail.cognito?.lastModifiedDate ?? null)}</p>
            </section>

            {/* Account status */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#808080]">Account status</h3>
              <p className="text-sm text-[#e8e8e8]">
                {detail.account.status}
                {detail.account.statusReason ? ` — ${detail.account.statusReason}` : ""}
              </p>
              {detail.account.statusChangedAt && (
                <p className="text-xs text-[#707070]">
                  Changed {formatWhen(detail.account.statusChangedAt)} by {detail.account.statusChangedBy}
                </p>
              )}
              <p className="mt-1 text-xs text-[#707070]">
                Cognito sign-in: {detail.cognito?.enabled === false ? "disabled" : "enabled"} ({detail.cognito?.userStatus ?? "unknown"})
              </p>
              <p className="text-xs text-[#707070]">
                Email verified: {detail.cognito?.emailVerified ? "yes" : "no"} · Phone verified: {detail.cognito?.phoneVerified ? "yes" : "no"}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {detail.account.status === "ACTIVE" && (
                  <button onClick={() => setPending({ kind: "status", action: "suspend" })} className="rounded-lg border border-yellow-700/40 bg-yellow-900/20 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-900/30">
                    Suspend
                  </button>
                )}
                {(detail.account.status === "ACTIVE" || detail.account.status === "SUSPENDED") && (
                  <button onClick={() => setPending({ kind: "status", action: "ban" })} className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30">
                    Ban
                  </button>
                )}
                {(detail.account.status === "SUSPENDED" || detail.account.status === "BANNED" || detail.account.status === "SOFT_DELETED") && (
                  <button onClick={() => setPending({ kind: "status", action: "reactivate" })} className="rounded-lg border border-green-700/40 bg-green-900/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-900/30">
                    Reactivate
                  </button>
                )}
                <button onClick={() => setPending({ kind: "revoke-sessions" })} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#e8e8e8] hover:bg-[#222]">
                  Force logout
                </button>
                <button onClick={runResetPassword} disabled={busy} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#e8e8e8] hover:bg-[#222] disabled:opacity-50">
                  Reset password
                </button>
                <button onClick={() => setShowVerifyForm((s) => !s)} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#e8e8e8] hover:bg-[#222]">
                  Verification override
                </button>
              </div>

              {showVerifyForm && (
                <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                  <label className="mb-2 flex items-center gap-2 text-sm text-[#c8c8c8]">
                    <input type="checkbox" checked={emailVerifiedDraft} onChange={(e) => setEmailVerifiedDraft(e.target.checked)} />
                    Email verified
                  </label>
                  <label className="mb-2 flex items-center gap-2 text-sm text-[#c8c8c8]">
                    <input type="checkbox" checked={phoneVerifiedDraft} onChange={(e) => setPhoneVerifiedDraft(e.target.checked)} />
                    Phone verified
                  </label>
                  <textarea
                    value={verifyReason}
                    onChange={(e) => setVerifyReason(e.target.value)}
                    placeholder="Reason"
                    rows={2}
                    className="mb-2 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-2 py-1.5 text-sm text-[#e8e8e8] outline-none"
                  />
                  <button onClick={submitVerify} disabled={busy} className="rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f6fd6] disabled:opacity-50">
                    Save override
                  </button>
                </div>
              )}
            </section>

            {/* Plan & roles */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#808080]">Plan & roles</h3>
              <p className="text-sm text-[#e8e8e8]">Plan: <span className="font-medium">{detail.tier}</span></p>
              <p className="text-sm text-[#e8e8e8]">Roles: {detail.roles.join(", ")}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setShowPlanForm((s) => !s)} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#e8e8e8] hover:bg-[#222]">
                  Change plan
                </button>
                <button onClick={() => setShowRolesForm((s) => !s)} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#e8e8e8] hover:bg-[#222]">
                  Assign roles
                </button>
              </div>

              {showPlanForm && (
                <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                  <select value={planDraft} onChange={(e) => setPlanDraft(e.target.value as AdminUserTier)} className="mb-2 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-2 py-1.5 text-sm text-[#e8e8e8]">
                    <option value="free">Free — 1 job / 7 days, 1 GiB storage, Spot pool</option>
                    <option value="pro">Pro — unlimited jobs, 10 GiB storage, priority On-Demand pool</option>
                  </select>
                  <textarea value={planReason} onChange={(e) => setPlanReason(e.target.value)} placeholder="Reason" rows={2} className="mb-2 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-2 py-1.5 text-sm text-[#e8e8e8]" />
                  <button onClick={submitPlan} disabled={busy} className="rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f6fd6] disabled:opacity-50">
                    Save plan
                  </button>
                </div>
              )}

              {showRolesForm && (
                <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                  {ASSIGNABLE_ROLES.map((r) => (
                    <label key={r} className="mb-1 flex items-center gap-2 text-sm text-[#c8c8c8]">
                      <input
                        type="checkbox"
                        checked={rolesDraft.includes(r)}
                        onChange={(e) =>
                          setRolesDraft((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                        }
                      />
                      {r}
                    </label>
                  ))}
                  <textarea value={rolesReason} onChange={(e) => setRolesReason(e.target.value)} placeholder="Reason" rows={2} className="mb-2 mt-2 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-2 py-1.5 text-sm text-[#e8e8e8]" />
                  <button onClick={submitRoles} disabled={busy} className="rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f6fd6] disabled:opacity-50">
                    Save roles
                  </button>
                </div>
              )}
            </section>

            {/* Usage */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#808080]">Usage & quota</h3>
              <p className="text-sm text-[#e8e8e8]">
                Jobs (7d): {detail.usage.usedInWindow ?? 0}
                {detail.usage.quotaLimit != null ? ` / ${detail.usage.quotaLimit}` : " / unlimited"}
              </p>
              <p className="text-sm text-[#e8e8e8]">
                Storage: {formatBytes(detail.usage.storageUsedBytes)} / {formatBytes(detail.usage.storageCapBytes)}
              </p>
            </section>

            {/* Recent jobs */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#808080]">Recent job activity</h3>
              {detail.recentJobs.length === 0 ? (
                <p className="text-sm text-[#707070]">No jobs yet.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.recentJobs.map((j) => (
                    <li key={j.sceneId} className="flex items-center justify-between text-sm text-[#c8c8c8]">
                      <span className="truncate">{j.name ?? j.sceneId}</span>
                      <span className="ml-2 shrink-0 text-xs text-[#808080]">{j.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Danger zone */}
            <section className="rounded-lg border border-[#3a2020] bg-[#1a1414] p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#c08080]">Danger zone</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setPending({ kind: "soft-delete" })} className="rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-1.5 text-xs font-medium text-[#f0a8a8] hover:bg-[#3a1a1a]">
                  Soft delete
                </button>
                <button onClick={() => setPending({ kind: "hard-delete" })} className="rounded-lg bg-[#c23a3a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a83030]">
                  Hard delete
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {pending?.kind === "status" && pending.action === "suspend" && (
        <ConfirmActionDialog
          title="Suspend account"
          description="Blocks new uploads and job submissions immediately. Currently-queued jobs are cancelled; running jobs finish normally. The user can still sign in."
          confirmLabel="Suspend"
          tone="destructive"
          busy={busy}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runStatusAction("suspend", reason)}
        />
      )}
      {pending?.kind === "status" && pending.action === "ban" && (
        <ConfirmActionDialog
          title="Ban account"
          description="Blocks sign-in and all job submissions immediately, and revokes active sessions. Currently-queued jobs are cancelled; running jobs finish normally."
          confirmLabel="Ban"
          tone="destructive"
          busy={busy}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runStatusAction("ban", reason)}
        />
      )}
      {pending?.kind === "status" && pending.action === "reactivate" && (
        <ConfirmActionDialog
          title="Reactivate account"
          description="Restores sign-in and upload/job access. Does not restore any jobs or data cancelled/removed while restricted."
          confirmLabel="Reactivate"
          requireReason={false}
          busy={busy}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runStatusAction("reactivate", reason)}
        />
      )}
      {pending?.kind === "revoke-sessions" && (
        <ConfirmActionDialog
          title="Force logout"
          description="Invalidates this user's refresh tokens. Already-issued access tokens remain valid until they naturally expire (Cognito has no immediate JWT revocation)."
          confirmLabel="Force logout"
          tone="destructive"
          busy={busy}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runRevokeSessions(reason)}
        />
      )}
      {pending?.kind === "soft-delete" && (
        <ConfirmActionDialog
          title="Soft delete account"
          description="Disables sign-in and new processing, revokes sessions, cancels queued jobs, and hides the account from the default directory. Scenes, comments, and other data are preserved for auditability and are not deleted."
          confirmLabel="Soft delete"
          tone="destructive"
          busy={busy}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runSoftDelete(reason)}
        />
      )}
      {pending?.kind === "hard-delete" && detail && (
        <ConfirmActionDialog
          title="Hard delete account"
          description={
            <>
              Irreversible. Permanently deletes the sign-in identity — this user can never authenticate again. The
              profile is anonymized. Scenes, comments, billing, and audit history are preserved (not deleted) to keep
              other users&apos; content and system records intact.
            </>
          }
          confirmLabel="Permanently delete"
          tone="destructive"
          requireTypedConfirmation={userId}
          busy={busy}
          error={actionError}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => runHardDelete(reason)}
        />
      )}
    </div>
  );
}
