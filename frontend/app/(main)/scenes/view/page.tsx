import { Suspense } from "react";
import ViewerPageClient from "@/components/dashboard/ViewerPageClient";

export default function ViewerPage() {
  return (
    <Suspense>
      <ViewerPageClient />
    </Suspense>
  );
}
