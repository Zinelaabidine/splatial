import { Suspense } from "react";
import AuthGate from "@/components/layout/AuthGate";
import ViewerPageClient from "@/components/dashboard/ViewerPageClient";

export default function ViewerPage() {
  return (
    <AuthGate>
      <Suspense>
        <ViewerPageClient />
      </Suspense>
    </AuthGate>
  );
}
