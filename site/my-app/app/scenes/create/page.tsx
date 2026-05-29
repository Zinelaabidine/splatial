"use client";

import AuthGate from "@/components/AuthGate";
import CreateSceneView from "@/components/dashboard/CreateSceneView";

export default function CreatePage() {
  return (
    <AuthGate>
      <CreateSceneView />
    </AuthGate>
  );
}
