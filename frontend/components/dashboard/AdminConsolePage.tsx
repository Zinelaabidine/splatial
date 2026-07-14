"use client";

import { useState } from "react";
import { Edit2, Lock, Search, Trash2, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";

type UserRole = "Admin" | "User";
type UserStatus = "Active" | "Invited" | "Suspended";

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  joinedDate: string;
  initials: string;
  hue: number;
}

const MOCK_USERS: MockUser[] = [
  {
    id: "u1",
    name: "Jane Doe",
    email: "jane.doe@splatial.io",
    role: "Admin",
    status: "Active",
    joinedDate: "May 1, 2026",
    initials: "JD",
    hue: 270,
  },
  {
    id: "u2",
    name: "Alex Chen",
    email: "alex.chen@splatial.io",
    role: "User",
    status: "Active",
    joinedDate: "May 10, 2026",
    initials: "AC",
    hue: 200,
  },
  {
    id: "u3",
    name: "Maria Garcia",
    email: "maria.garcia@splatial.io",
    role: "User",
    status: "Invited",
    joinedDate: "May 20, 2026",
    initials: "MG",
    hue: 150,
  },
  {
    id: "u4",
    name: "Tom Wilson",
    email: "tom.wilson@splatial.io",
    role: "User",
    status: "Suspended",
    joinedDate: "Apr 15, 2026",
    initials: "TW",
    hue: 30,
  },
  {
    id: "u5",
    name: "Sarah Kim",
    email: "sarah.kim@splatial.io",
    role: "Admin",
    status: "Active",
    joinedDate: "Mar 5, 2026",
    initials: "SK",
    hue: 310,
  },
];

function StatusBadge({ status }: { status: UserStatus }) {
  const config: Record<
    UserStatus,
    { dot: string; text: string; bg: string }
  > = {
    Active: {
      dot: "bg-[var(--nord-success)]",
      text: "text-[var(--nord-success)]",
      bg: "bg-[var(--nord-success)]",
    },
    Invited: {
      dot: "bg-yellow-400",
      text: "text-[#9a6b1f]",
      bg: "bg-yellow-50",
    },
    Suspended: {
      dot: "bg-red-500",
      text: "text-red-700",
      bg: "bg-red-50",
    },
  };
  const { dot, text, bg } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        bg,
        text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
        role === "Admin"
          ? "bg-purple-100 text-purple-700"
          : "bg-[var(--nord-surface-2)] text-[var(--nord-slate-soft)]",
      )}
    >
      {role}
    </span>
  );
}

export default function AdminConsolePage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-full bg-[var(--nord-surface-2)] p-6">
      <div className="mx-auto max-w-6xl">
        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--nord-ink)]">
              User Management
            </h1>
            <p className="mt-0.5 text-sm text-[var(--nord-slate)]">
              {MOCK_USERS.length} total users
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-[var(--nord-ink)] shadow-sm transition hover:bg-purple-700"
          >
            <UserPlus className="h-4 w-4" />
            Invite User
          </button>
        </div>

        {/* ── Search ───────────────────────────────────────────────── */}
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nord-slate)]" />
          <input
            type="search"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] pl-9 pr-4 text-sm text-[var(--nord-ink)] placeholder:text-[var(--nord-slate)] outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
          />
        </div>

        {/* ── Table ────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--nord-hairline)] bg-[var(--nord-surface-2)]">
                {["User", "Role", "Status", "Joined Date", "Actions"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--nord-slate)]",
                        heading === "Actions" ? "text-right" : "text-left",
                      )}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--nord-hairline)]">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="transition-colors hover:bg-[var(--nord-surface-2)]"
                >
                  {/* User */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-[var(--nord-ink)]"
                        style={{ background: `hsl(${u.hue} 60% 55%)` }}
                      >
                        {u.initials}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--nord-ink)]">{u.name}</p>
                        <p className="text-xs text-[var(--nord-slate)]">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3.5">
                    <RoleBadge role={u.role} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <StatusBadge status={u.status} />
                  </td>

                  {/* Joined Date */}
                  <td className="px-4 py-3.5 text-[var(--nord-slate-soft)]">{u.joinedDate}</td>

                  {/* Actions */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-[var(--nord-slate)] transition hover:bg-[var(--nord-surface-2)] hover:text-[var(--nord-ink)]"
                        aria-label={`Edit ${u.name}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-[var(--nord-slate)] transition hover:bg-yellow-50 hover:text-yellow-600"
                        aria-label={`Suspend ${u.name}`}
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-[var(--nord-slate)] transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${u.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-[var(--nord-slate)]"
                  >
                    No users match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
