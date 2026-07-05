"use client";

import { useState } from "react";

import AdminAttemptsView from "@/components/admin/AdminAttemptsView";
import WorkerAmiPanel from "@/components/admin/WorkerAmiPanel";

const TABS = [
  { value: "attempts", label: "Attempts" },
  { value: "worker-amis", label: "Worker AMIs" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("attempts");

  return (
    <div>
      <div className="mx-auto mb-5 flex max-w-6xl items-center gap-2 border-b border-[#2a2a2a] px-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? "border-[#3b82f6] text-[#f1f1f1]"
                : "border-transparent text-[#808080] hover:text-[#c8c8c8]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "attempts" ? <AdminAttemptsView /> : <WorkerAmiPanel />}
    </div>
  );
}
