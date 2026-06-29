"use client";

import dynamic from "next/dynamic";

const GaussianViewer = dynamic(() => import("@/components/viewer/GaussianViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-black">
      <p className="text-sm text-slate-400">Initialising viewer…</p>
    </div>
  ),
});

export default function ViewerShell({
  sceneId,
  shotId,
}: {
  sceneId: string;
  shotId?: string | null;
}) {
  return <GaussianViewer sceneId={sceneId} shotId={shotId} />;
}
