"use client";

import AuthGate from "@/components/layout/AuthGate";
import CreateSceneContainer from "@/components/features/create/CreateSceneContainer";

export default function CreatePage() {
  return (
    <AuthGate>
      <CreateSceneContainer />
    </AuthGate>
  );
}
