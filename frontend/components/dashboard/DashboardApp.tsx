"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AdminConsolePage from "@/components/dashboard/AdminConsolePage";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import ProfilePage from "@/components/dashboard/ProfilePage";
import TopNavBar from "@/components/dashboard/TopNavBar";

type LocalMode = "dashboard" | "profile" | "admin";

export default function DashboardApp() {
  const router = useRouter();
  const [currentMode, setCurrentMode] = useState<LocalMode>("dashboard");

  return (
    <div className="flex h-screen flex-col bg-[var(--nord-surface-2)] text-[var(--nord-ink)]">
      <TopNavBar
        mode={currentMode}
        onCreateClick={() => router.push("/scenes/create")}
        onLibraryClick={() => setCurrentMode("dashboard")}
        onAdminClick={() => setCurrentMode("admin")}
        onProfileClick={() => setCurrentMode("profile")}
      />
      <main className="flex-1 overflow-y-auto">
        {currentMode === "dashboard" && <DashboardGrid />}
        {currentMode === "profile" && (
          <ProfilePage onBack={() => setCurrentMode("dashboard")} />
        )}
        {currentMode === "admin" && <AdminConsolePage />}
      </main>
    </div>
  );
}

