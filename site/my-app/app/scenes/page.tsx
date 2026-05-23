"use client";

import AuthGate from "@/components/AuthGate";
import ScenesDashboard from "@/components/ScenesDashboard";

export default function ScenesPage() {
  return (
    <AuthGate>
      <ScenesDashboard />
    </AuthGate>
  );
}
