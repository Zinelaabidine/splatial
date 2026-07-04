"use client";

import { useState } from "react";

import AdminAttemptsView from "@/components/admin/AdminAttemptsView";
import AdminAsgConfigView from "@/components/admin/AdminAsgConfigView";

const TABS = [
  { id: "attempts", label: "Attempts" },
  { id: "asg", label: "ASG config" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminShell() {
  const [tab, setTab] = useState<TabId>("attempts");

  return (
    <div>
      <div className="mx-auto mb-6 flex max-w-6xl gap-1 border-b border-[#2a2a2a]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[#3b82f6] text-[#f1f1f1]"
                : "border-transparent text-[#808080] hover:text-[#c8c8c8]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "attempts" ? <AdminAttemptsView /> : <AdminAsgConfigView />}
    </div>
  );
}
