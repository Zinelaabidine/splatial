"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { usePageSearch } from "@/components/layout/AppShellContext";

const ViewerShell = dynamic(() => import("@/components/viewer/ViewerShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0f0f0f]">
      <p className="text-sm text-[#aaa]">Initialising viewer…</p>
    </div>
  ),
});

export default function ViewerPageClient() {
  const searchParams = useSearchParams();
  const sceneId = searchParams.get("id") ?? "";
  const shotId = searchParams.get("shot");
  usePageSearch("", false);

  return (
    <div className="min-h-full">
      <ViewerShell sceneId={sceneId} shotId={shotId} />
    </div>
  );
}
