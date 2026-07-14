"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Search, ShieldAlert, Users } from "lucide-react";

import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";
import { listAdminUsers } from "@/services/adminUsersService";
import AdminUserDetailPanel from "@/components/admin/AdminUserDetailPanel";
import type { AdminUserRole, AdminUserStatus, AdminUserSummary, AdminUserTier } from "@/types/adminUsers";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: AdminUserStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "BANNED", label: "Banned" },
  { value: "SOFT_DELETED", label: "Soft-deleted" },
];

const TIER_OPTIONS: { value: AdminUserTier | ""; label: string }[] = [
  { value: "", label: "All plans" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
];

const ROLE_OPTIONS: { value: AdminUserRole | ""; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "moderator", label: "Moderator" },
  { value: "beta_tester", label: "Beta tester" },
  { value: "user", label: "User" },
];

const STATUS_STYLES: Record<AdminUserStatus, string> = {
  ACTIVE: "border-[var(--nord-success)] bg-[var(--nord-success)] text-[var(--nord-success)]",
  SUSPENDED: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  BANNED: "border-[var(--nord-danger)] bg-red-500/10 text-[var(--nord-danger)]",
  SOFT_DELETED: "border-[var(--nord-hairline)] bg-[var(--nord-surface)] text-[var(--nord-slate)]",
  HARD_DELETED: "border-[var(--nord-hairline)] bg-[var(--nord-surface)] text-[var(--nord-slate)]",
};

const ROLE_STYLES: Record<string, string> = {
  admin: "border-[var(--nord-teal)] bg-[var(--nord-pine)] text-[var(--nord-teal)]",
  moderator: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  beta_tester: "border-[var(--nord-hairline)] bg-[var(--nord-surface)] text-[var(--nord-ink)]",
  user: "border-[var(--nord-hairline)] bg-[var(--nord-surface)] text-[var(--nord-slate)]",
};

const FILTER_SELECT_CLASS =
  "h-9 w-full rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 text-sm text-[var(--nord-ink)] outline-none transition-colors focus:border-[var(--nord-teal)] focus:ring-1 focus:ring-[var(--nord-teal)]";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatStatusLabel(status: AdminUserStatus): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

type SortField = "joinedAt" | "email" | "status" | "tier" | "displayName";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--nord-slate)]">{label}</label>
      {children}
    </div>
  );
}

function SortHeader({
  label,
  field,
  activeField,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  sortDir: "asc" | "desc";
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = field === activeField;
  return (
    <th
      className={cn(
        "cursor-pointer select-none px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--nord-ink)] transition-colors hover:text-[var(--nord-ink)]",
        className,
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-[var(--nord-teal)]" /> : <ArrowDown className="h-3 w-3 text-[var(--nord-teal)]" />)}
      </span>
    </th>
  );
}

export default function AdminUsersView() {
  const isAdmin = useIsAdmin();

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailInput, setEmailInput] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<AdminUserStatus | "">("");
  const [tier, setTier] = useState<AdminUserTier | "">("");
  const [role, setRole] = useState<AdminUserRole | "">("");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("joinedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts: { cursor?: string; append: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await listAdminUsers({
          email: email || undefined,
          status: status || undefined,
          tier: tier || undefined,
          role: role || undefined,
          joinedFrom: joinedFrom || undefined,
          joinedTo: joinedTo || undefined,
          sort: `${sortField}:${sortDir}`,
          limit: PAGE_SIZE,
          cursor: opts.cursor,
          signal: controller.signal,
        });
        setUsers((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCursor(res.cursor);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        if (opts.append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [email, status, tier, role, joinedFrom, joinedTo, sortField, sortDir],
  );

  useEffect(() => {
    if (isAdmin === true) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load({ cursor: undefined, append: false });
    }
    return () => abortRef.current?.abort();
  }, [isAdmin, load]);

  useEffect(() => {
    const t = setTimeout(() => setEmail(emailInput.trim()), 350);
    return () => clearTimeout(t);
  }, [emailInput]);

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--nord-slate)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--nord-teal)]" />
        Checking access…
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-6 py-10 text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-[var(--nord-danger)]" />
        <h2 className="text-lg font-semibold text-[var(--nord-ink)]">Admin access required</h2>
        <p className="mt-1 text-sm text-[var(--nord-slate)]">
          Your account isn’t in the admin group. Ask an operator to add you, then sign out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] w-full gap-0">
      {/* Primary pane — search, filters, table */}
      <div className="flex min-w-0 flex-1 flex-col pr-5">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--nord-ink)]">User management</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--nord-slate)]">
              Search, filter, and take account actions across your user directory. Every action is audit-logged.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load({ cursor: undefined, append: false })}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3.5 py-2 text-sm font-medium text-[var(--nord-ink)] transition-colors hover:border-[var(--nord-hairline)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nord-slate)]" />
          <input
            type="search"
            placeholder="Search by email, username, or display name…"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="h-11 w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] pl-10 pr-4 text-sm text-[var(--nord-ink)] outline-none placeholder:text-[var(--nord-slate-soft)] transition-colors focus:border-[var(--nord-teal)] focus:ring-2 focus:ring-[var(--nord-teal)]"
          />
        </div>

        <div className="mb-5 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--nord-slate)]">Filters</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <FilterField label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AdminUserStatus | "")}
                className={FILTER_SELECT_CLASS}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Plan">
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as AdminUserTier | "")}
                className={FILTER_SELECT_CLASS}
              >
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminUserRole | "")}
                className={FILTER_SELECT_CLASS}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Joined from">
              <input
                type="date"
                value={joinedFrom}
                onChange={(e) => setJoinedFrom(e.target.value)}
                className={FILTER_SELECT_CLASS}
              />
            </FilterField>
            <FilterField label="Joined to">
              <input
                type="date"
                value={joinedTo}
                onChange={(e) => setJoinedTo(e.target.value)}
                className={FILTER_SELECT_CLASS}
              />
            </FilterField>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-4 py-3 text-sm text-[var(--nord-danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] py-24 text-[var(--nord-slate)]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--nord-teal)]" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--nord-hairline)] bg-[var(--nord-surface)] py-24 text-sm text-[var(--nord-slate)]">
            No users match your filters.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--nord-hairline)] bg-[var(--nord-surface)]">
                      <SortHeader label="User" field="displayName" activeField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Status" field="status" activeField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--nord-ink)]">
                        Roles
                      </th>
                      <SortHeader label="Plan" field="tier" activeField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader
                        label="Joined"
                        field="joinedAt"
                        activeField={sortField}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--nord-ink)]">
                        Scenes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const selected = selectedUserId === u.userId;
                      return (
                        <tr
                          key={u.userId}
                          onClick={() => setSelectedUserId(u.userId)}
                          className={cn(
                            "cursor-pointer border-b border-[var(--nord-hairline)] transition-colors last:border-b-0",
                            selected
                              ? "bg-[var(--nord-pine)]/[0.08] hover:bg-[var(--nord-pine)]/[0.1]"
                              : "hover:bg-[var(--nord-surface)]",
                          )}
                        >
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-[var(--nord-ink)]">{u.displayName || u.username || "—"}</p>
                            <p className="mt-0.5 text-xs text-[var(--nord-slate)]">{u.email ?? u.username ?? u.userId}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                                STATUS_STYLES[u.status],
                              )}
                            >
                              {formatStatusLabel(u.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((r) => (
                                <span
                                  key={r}
                                  className={cn(
                                    "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
                                    ROLE_STYLES[r] ?? ROLE_STYLES.user,
                                  )}
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={cn(
                                "font-medium capitalize",
                                u.tier === "pro" ? "text-[var(--nord-teal)]" : "text-[var(--nord-ink)]",
                              )}
                            >
                              {u.tier}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 tabular-nums text-[var(--nord-slate)]">{formatDate(u.joinedAt)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-[var(--nord-slate)]">{u.scenesCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {cursor && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => load({ cursor, append: true })}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-4 py-2 text-sm font-medium text-[var(--nord-ink)] transition-colors hover:border-[var(--nord-hairline)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail pane — selected user or empty state */}
      <aside className="flex w-[min(100%,400px)] shrink-0 flex-col border-l border-[var(--nord-hairline)] bg-[var(--nord-bg)] xl:w-[420px]">
        {selectedUserId ? (
          <AdminUserDetailPanel
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
            onChanged={() => load({ cursor: undefined, append: false })}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)]">
              <Users className="h-5 w-5 text-[var(--nord-slate-soft)]" />
            </div>
            <p className="text-sm font-medium text-[var(--nord-slate)]">No user selected</p>
            <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-[var(--nord-slate-soft)]">
              Select a row from the table to review profile, standing, and take account actions.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
