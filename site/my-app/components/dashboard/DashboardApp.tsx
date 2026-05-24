"use client";

import { useState } from "react";

import AdminConsolePage from "@/components/dashboard/AdminConsolePage";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import ProfilePage from "@/components/dashboard/ProfilePage";
import TopNavBar from "@/components/dashboard/TopNavBar";

type LocalMode = "dashboard" | "profile" | "admin";

export default function DashboardApp() {
  const [currentMode, setCurrentMode] = useState<LocalMode>("dashboard");

  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900">
      <TopNavBar
        mode={currentMode}
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

