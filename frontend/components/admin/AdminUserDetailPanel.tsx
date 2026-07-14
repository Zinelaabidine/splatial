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
import { cn } from "@/lib/utils";

const ASSIGNABLE_ROLES: AdminUserRole[] = ["admin", "moderator", "beta_tester"];

const INPUT_CLASS =
  "w-full rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-bg)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none transition-colors focus:border-[var(--nord-teal)] focus:ring-1 focus:ring-[var(--nord-teal)]";

const BTN_SECONDARY =
  "rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-1.5 text-xs font-medium text-[var(--nord-ink)] transition-colors hover:border-[var(--nord-hairline)] hover:bg-[var(--nord-surface)] disabled:opacity-50";

const BTN_WARNING =
  "rounded-md border border-amber-600/40 bg-[#f4ecd6] px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:border-amber-500/50 hover:bg-[#f4ecd6] disabled:opacity-50";

const BTN_DANGER_OUTLINE =
  "rounded-md border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-3 py-1.5 text-xs font-medium text-[var(--nord-danger)] transition-colors hover:border-[var(--nord-danger)] hover:bg-[var(--nord-danger-tint)] disabled:opacity-50";

const BTN_DANGER_FILLED =
  "rounded-md border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-3 py-1.5 text-xs font-medium text-[var(--nord-danger)] transition-colors hover:bg-[var(--nord-danger-tint)] disabled:opacity-50";

const BTN_PRIMARY =
  "rounded-md border border-[var(--nord-teal)] bg-[var(--nord-pine)] px-3 py-1.5 text-xs font-medium text-[var(--nord-teal)] transition-colors hover:bg-[var(--nord-pine)] disabled:opacity-50";

const BTN_POSITIVE =
  "rounded-md border border-[var(--nord-success)] bg-[var(--nord-success-tint)] px-3 py-1.5 text-xs font-medium text-[var(--nord-success)] transition-colors hover:border-[var(--nord-success)] hover:bg-[var(--nord-success-tint)] disabled:opacity-50";

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

function DetailCard({
  title,
  children,
  variant = "default",
}: {
  title: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        variant === "danger"
          ? "border-[var(--nord-danger)] bg-[var(--nord-danger-tint)]"
          : "border-[var(--nord-hairline)] bg-[var(--nord-surface)]",
      )}
    >
      <h3
        className={cn(
          "mb-3 text-[11px] font-semibold uppercase tracking-wider",
          variant === "danger" ? "text-[var(--nord-danger)]" : "text-[var(--nord-slate)]",
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--nord-hairline)] py-2 last:border-b-0">
      <span className="shrink-0 text-xs text-[var(--nord-slate)]">{label}</span>
      <span className="text-right text-sm text-[var(--nord-ink)]">{value}</span>
    </div>
  );
}

function ActionGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      {label && <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--nord-slate-soft)]">{label}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
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
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--nord-hairline)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--nord-ink)]">User details</h2>
            <p className="mt-0.5 text-xs text-[var(--nord-slate)]">Review standing and take actions</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--nord-slate)] transition-colors hover:bg-[var(--nord-surface)] hover:text-[var(--nord-ink)]"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-[var(--nord-slate)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--nord-teal)]" />
              Loading…
            </div>
          ) : error || !detail ? (
            <div className="rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-4 py-3 text-sm text-[var(--nord-danger)]">
              {error ?? "User not found"}
            </div>
          ) : (
            <div className="space-y-4">
              {actionError && (
                <div className="rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-3 py-2 text-sm text-[var(--nord-danger)]">
                  {actionError}
                </div>
              )}

              <DetailCard title="Profile">
                <p className="text-base font-semibold text-[var(--nord-ink)]">{detail.profile.displayName || "—"}</p>
                <p className="mt-1 text-sm text-[var(--nord-slate)]">{detail.profile.email ?? "No email on file"}</p>
                <p className="text-sm text-[var(--nord-slate)]">@{detail.profile.username ?? "—"}</p>
                <div className="mt-3 space-y-0">
                  <MetaRow label="Joined" value={formatWhen(detail.profile.createdAt)} />
                  <MetaRow
                    label="Last profile activity"
                    value={formatWhen(detail.cognito?.lastModifiedDate ?? null)}
                  />
                </div>
              </DetailCard>

              <DetailCard title="Account status">
                <div className="space-y-0">
                  <MetaRow
                    label="Standing"
                    value={
                      <span className="font-medium">
                        {detail.account.status.replace(/_/g, " ")}
                        {detail.account.statusReason ? ` — ${detail.account.statusReason}` : ""}
                      </span>
                    }
                  />
                  {detail.account.statusChangedAt && (
                    <MetaRow
                      label="Changed"
                      value={`${formatWhen(detail.account.statusChangedAt)} by ${detail.account.statusChangedBy}`}
                    />
                  )}
                  <MetaRow
                    label="Cognito sign-in"
                    value={
                      detail.cognito?.enabled === false
                        ? "Disabled"
                        : `Enabled (${detail.cognito?.userStatus ?? "unknown"})`
                    }
                  />
                  <MetaRow
                    label="Email verified"
                    value={detail.cognito?.emailVerified ? "Yes" : "No"}
                  />
                  <MetaRow
                    label="Phone verified"
                    value={detail.cognito?.phoneVerified ? "Yes" : "No"}
                  />
                </div>

                <ActionGroup label="Standing actions">
                  {detail.account.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => setPending({ kind: "status", action: "suspend" })}
                      className={BTN_WARNING}
                    >
                      Suspend
                    </button>
                  )}
                  {(detail.account.status === "ACTIVE" || detail.account.status === "SUSPENDED") && (
                    <button
                      type="button"
                      onClick={() => setPending({ kind: "status", action: "ban" })}
                      className={BTN_DANGER_OUTLINE}
                    >
                      Ban
                    </button>
                  )}
                  {(detail.account.status === "SUSPENDED" ||
                    detail.account.status === "BANNED" ||
                    detail.account.status === "SOFT_DELETED") && (
                    <button
                      type="button"
                      onClick={() => setPending({ kind: "status", action: "reactivate" })}
                      className={BTN_POSITIVE}
                    >
                      Reactivate
                    </button>
                  )}
                </ActionGroup>

                <ActionGroup label="Session & access">
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "revoke-sessions" })}
                    className={BTN_SECONDARY}
                  >
                    Force logout
                  </button>
                  <button type="button" onClick={runResetPassword} disabled={busy} className={BTN_SECONDARY}>
                    Reset password
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVerifyForm((s) => !s)}
                    className={BTN_SECONDARY}
                  >
                    Verification override
                  </button>
                </ActionGroup>

                {showVerifyForm && (
                  <div className="mt-3 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-bg)] p-3">
                    <label className="mb-2 flex items-center gap-2 text-sm text-[var(--nord-ink)]">
                      <input
                        type="checkbox"
                        checked={emailVerifiedDraft}
                        onChange={(e) => setEmailVerifiedDraft(e.target.checked)}
                        className="rounded border-[var(--nord-hairline)]"
                      />
                      Email verified
                    </label>
                    <label className="mb-3 flex items-center gap-2 text-sm text-[var(--nord-ink)]">
                      <input
                        type="checkbox"
                        checked={phoneVerifiedDraft}
                        onChange={(e) => setPhoneVerifiedDraft(e.target.checked)}
                        className="rounded border-[var(--nord-hairline)]"
                      />
                      Phone verified
                    </label>
                    <textarea
                      value={verifyReason}
                      onChange={(e) => setVerifyReason(e.target.value)}
                      placeholder="Reason (optional)"
                      rows={2}
                      className={cn(INPUT_CLASS, "mb-2")}
                    />
                    <button type="button" onClick={submitVerify} disabled={busy} className={BTN_PRIMARY}>
                      Save override
                    </button>
                  </div>
                )}
              </DetailCard>

              <DetailCard title="Plan & roles">
                <div className="space-y-0">
                  <MetaRow
                    label="Plan"
                    value={<span className="font-medium capitalize text-[var(--nord-teal)]">{detail.tier}</span>}
                  />
                  <MetaRow label="Roles" value={detail.roles.join(", ") || "—"} />
                </div>

                <ActionGroup>
                  <button type="button" onClick={() => setShowPlanForm((s) => !s)} className={BTN_SECONDARY}>
                    Change plan
                  </button>
                  <button type="button" onClick={() => setShowRolesForm((s) => !s)} className={BTN_SECONDARY}>
                    Assign roles
                  </button>
                </ActionGroup>

                {showPlanForm && (
                  <div className="mt-3 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-bg)] p-3">
                    <select
                      value={planDraft}
                      onChange={(e) => setPlanDraft(e.target.value as AdminUserTier)}
                      className={cn(INPUT_CLASS, "mb-2")}
                    >
                      <option value="free">Free — 1 job / 7 days, 1 GiB storage, Spot pool</option>
                      <option value="pro">Pro — unlimited jobs, 10 GiB storage, priority On-Demand pool</option>
                    </select>
                    <textarea
                      value={planReason}
                      onChange={(e) => setPlanReason(e.target.value)}
                      placeholder="Reason (required)"
                      rows={2}
                      className={cn(INPUT_CLASS, "mb-2")}
                    />
                    <button type="button" onClick={submitPlan} disabled={busy} className={BTN_PRIMARY}>
                      Save plan
                    </button>
                  </div>
                )}

                {showRolesForm && (
                  <div className="mt-3 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-bg)] p-3">
                    {ASSIGNABLE_ROLES.map((r) => (
                      <label key={r} className="mb-1.5 flex items-center gap-2 text-sm text-[var(--nord-ink)]">
                        <input
                          type="checkbox"
                          checked={rolesDraft.includes(r)}
                          onChange={(e) =>
                            setRolesDraft((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                          }
                          className="rounded border-[var(--nord-hairline)]"
                        />
                        {r}
                      </label>
                    ))}
                    <textarea
                      value={rolesReason}
                      onChange={(e) => setRolesReason(e.target.value)}
                      placeholder="Reason (required)"
                      rows={2}
                      className={cn(INPUT_CLASS, "mb-2 mt-2")}
                    />
                    <button type="button" onClick={submitRoles} disabled={busy} className={BTN_PRIMARY}>
                      Save roles
                    </button>
                  </div>
                )}
              </DetailCard>

              <DetailCard title="Usage & quota">
                <div className="space-y-0">
                  <MetaRow
                    label="Jobs (7d)"
                    value={
                      <>
                        {detail.usage.usedInWindow ?? 0}
                        {detail.usage.quotaLimit != null ? ` / ${detail.usage.quotaLimit}` : " / unlimited"}
                      </>
                    }
                  />
                  <MetaRow
                    label="Storage"
                    value={`${formatBytes(detail.usage.storageUsedBytes)} / ${formatBytes(detail.usage.storageCapBytes)}`}
                  />
                </div>
              </DetailCard>

              <DetailCard title="Recent activity">
                {detail.recentJobs.length === 0 ? (
                  <p className="text-sm text-[var(--nord-slate)]">No jobs yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--nord-hairline)]">
                    {detail.recentJobs.map((j) => (
                      <li key={j.sceneId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="truncate text-sm text-[var(--nord-ink)]">{j.name ?? j.sceneId}</span>
                        <span className="shrink-0 rounded border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--nord-slate)]">
                          {j.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailCard>

              <DetailCard title="Danger zone" variant="danger">
                <p className="mb-3 text-xs leading-relaxed text-[var(--nord-slate)]">
                  Destructive actions disable access and may remove the sign-in identity. Each requires confirmation
                  and is recorded in the audit log.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "soft-delete" })}
                    className={BTN_DANGER_OUTLINE}
                  >
                    Soft delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "hard-delete" })}
                    className={BTN_DANGER_FILLED}
                  >
                    Hard delete
                  </button>
                </div>
              </DetailCard>
            </div>
          )}
        </div>
      </div>

      {pending?.kind === "status" && pending.action === "suspend" && (
        <ConfirmActionDialog
          title="Suspend account"
          description="Blocks new uploads and job submissions immediately. Currently-queued jobs are cancelled; running jobs finish normally. The user can still sign in."
          confirmLabel="Suspend"
          tone="warning"
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
    </>
  );
}
