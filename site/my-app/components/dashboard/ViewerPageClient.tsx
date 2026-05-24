"use client";

import dynamic from "next/dynamic";
import TopNavBar from "@/components/dashboard/TopNavBar";

const ViewerShell = dynamic(() => import("@/components/ViewerShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-950">
      <p className="text-sm text-gray-400">Initialising viewer…</p>
    </div>
  ),
});

export default function ViewerPageClient({ sceneId }: { sceneId: string }) {
  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900">
      <TopNavBar mode="viewer" />
      <main className="flex-1 overflow-hidden">
        <ViewerShell sceneId={sceneId} />
      </main>
    </div>
  );
}
