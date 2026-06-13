"use client";

import AuthGate from "@/components/layout/AuthGate";
import CreateSceneView from "@/components/dashboard/CreateSceneView";

export default function CreatePage() {
  return (
    <AuthGate>
      <CreateSceneView />
    </AuthGate>
  );
}
