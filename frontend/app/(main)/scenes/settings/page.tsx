import { Suspense } from "react";
import SceneSettingsPageClient from "@/components/dashboard/SceneSettingsPageClient";

export default function SceneSettingsPage() {
  return (
    <Suspense>
      <SceneSettingsPageClient />
    </Suspense>
  );
}
