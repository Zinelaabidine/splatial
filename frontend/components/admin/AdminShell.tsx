"use client";

import { useState } from "react";

import AdminAttemptsView from "@/components/admin/AdminAttemptsView";
import AdminAsgConfigView from "@/components/admin/AdminAsgConfigView";
import WorkerAmiPanel from "@/components/admin/WorkerAmiPanel";
import AdminUsersView from "@/components/admin/AdminUsersView";
import AdminAuditLogView from "@/components/admin/AdminAuditLogView";

const TABS = [
  { id: "users", label: "Users" },
  { id: "attempts", label: "Attempts" },
  { id: "asg", label: "ASG config" },
  { id: "worker-amis", label: "Worker AMIs" },
  { id: "audit-log", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminShell() {
  const [tab, setTab] = useState<TabId>("users");

  return (
    <div>
      <div className="mx-auto mb-6 flex max-w-6xl gap-1 border-b border-[var(--nord-hairline)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[#3b82f6] text-[var(--nord-ink)]"
                : "border-transparent text-[var(--nord-slate)] hover:text-[var(--nord-ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="mx-auto w-full max-w-[1600px]">
          <AdminUsersView />
        </div>
      )}
      {tab === "attempts" && <AdminAttemptsView />}
      {tab === "asg" && <AdminAsgConfigView />}
      {tab === "worker-amis" && <WorkerAmiPanel />}
      {tab === "audit-log" && <AdminAuditLogView />}
    </div>
  );
}
