import { Suspense } from "react";
import EditScenePageClient from "@/components/dashboard/EditScenePageClient";

export default function EditScenePage() {
  return (
    <Suspense>
      <EditScenePageClient />
    </Suspense>
  );
}
