"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react";

import { useIsAdmin } from "@/lib/auth/useIsAdmin";
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
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-yellow-100 text-yellow-700",
  BANNED: "bg-red-100 text-red-700",
  SOFT_DELETED: "bg-slate-200 text-slate-600",
  HARD_DELETED: "bg-slate-300 text-slate-700",
};

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  moderator: "bg-blue-100 text-blue-700",
  beta_tester: "bg-teal-100 text-teal-700",
  user: "bg-[#2a2a2a] text-[#c8c8c8]",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type SortField = "joinedAt" | "email" | "status" | "tier" | "displayName";

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

  // Debounce the free-text email search.
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
      <div className="flex h-64 items-center justify-center text-[#909090]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-xl border border-[#2a2a2a] bg-[#161616] px-6 py-10 text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-[#d98a8a]" />
        <h2 className="text-lg font-semibold text-[#f1f1f1]">Admin access required</h2>
        <p className="mt-1 text-sm text-[#909090]">
          Your account isn’t in the admin group. Ask an operator to add you, then sign out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#f1f1f1]">User management</h1>
          <p className="text-sm text-[#909090]">Search, filter, and take account actions. Every action is audit-logged.</p>
        </div>
        <button
          type="button"
          onClick={() => load({ cursor: undefined, append: false })}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] transition-colors hover:bg-[#222] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#707070]" />
          <input
            type="search"
            placeholder="Search email, username, name…"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] pl-9 pr-3 text-sm text-[#e8e8e8] outline-none placeholder:text-[#606060] focus:border-[#3b82f6]"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AdminUserStatus | "")}
          className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as AdminUserTier | "")}
          className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminUserRole | "")}
          className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#909090]">
          Joined
          <input
            type="date"
            value={joinedFrom}
            onChange={(e) => setJoinedFrom(e.target.value)}
            className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
          />
          –
          <input
            type="date"
            value={joinedTo}
            onChange={(e) => setJoinedTo(e.target.value)}
            className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
          />
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-4 py-3 text-sm text-[#f0a8a8]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-[#909090]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading users…
        </div>
      ) : users.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] text-[#808080]">
          No users match your filters.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a] text-left text-xs font-semibold uppercase tracking-wider text-[#808080]">
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("displayName")}>User</th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("status")}>Status</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("tier")}>Plan</th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("joinedAt")}>Joined</th>
                  <th className="px-4 py-3">Scenes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232323]">
                {users.map((u) => (
                  <tr
                    key={u.userId}
                    onClick={() => setSelectedUserId(u.userId)}
                    className="cursor-pointer transition-colors hover:bg-[#1d1d1d]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#e8e8e8]">{u.displayName || u.username || "—"}</p>
                      <p className="text-xs text-[#808080]">{u.email ?? u.username ?? u.userId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[u.status]}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[r] ?? ROLE_STYLES.user}`}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#c8c8c8]">{u.tier}</td>
                    <td className="px-4 py-3 text-[#c8c8c8]">{formatDate(u.joinedAt)}</td>
                    <td className="px-4 py-3 text-[#c8c8c8]">{u.scenesCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => load({ cursor, append: true })}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm text-[#e8e8e8] transition-colors hover:bg-[#222] disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}

      {selectedUserId && (
        <AdminUserDetailPanel
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onChanged={() => load({ cursor: undefined, append: false })}
        />
      )}
    </div>
  );
}
