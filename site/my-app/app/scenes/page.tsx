"use client";

import AuthGate from "@/components/layout/AuthGate";
import DashboardApp from "@/components/dashboard/DashboardApp";

export default function ScenesPage() {
  return (
    <AuthGate>
      <DashboardApp />
    </AuthGate>
  );
}
