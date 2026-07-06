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
  const tourId = searchParams.get("tour");
  const shotId = tourId ? null : searchParams.get("shot");
  const fromScene = searchParams.get("fromScene");
  const fromUser = searchParams.get("fromUser");
  const lineageFromUrl =
    fromScene || fromUser
      ? {
          forkedFromSceneId: fromScene,
          forkedFromUsername: fromUser,
        }
      : undefined;
  usePageSearch("", false);

  return (
    // `h-full` (not `min-h-full`) is required here: GaussianViewer's new
    // side-rail layout resolves its own height as a percentage of this div,
    // and percentage heights only resolve against an ancestor with a
    // *definite* height — a min-height floor doesn't count. `<main>` in
    // AppShell provides that definite height via `flex-1` inside a
    // `h-screen flex-col` shell.
    <div className="h-full">
      <ViewerShell
        sceneId={sceneId}
        shotId={shotId}
        tourId={tourId}
        lineageFromUrl={lineageFromUrl}
      />
    </div>
  );
}
