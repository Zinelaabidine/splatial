"use client";

import dynamic from "next/dynamic";

const GaussianViewer = dynamic(() => import("@/components/viewer/GaussianViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[var(--nord-bg)]">
      <p className="text-sm text-[var(--nord-slate)]">Initialising viewer…</p>
    </div>
  ),
});

export default function ViewerShell({
  sceneId,
  shotId,
  tourId,
  lineageFromUrl,
}: {
  sceneId: string;
  shotId?: string | null;
  tourId?: string | null;
  lineageFromUrl?: {
    forkedFromSceneId: string | null;
    forkedFromUsername: string | null;
  };
}) {
  return (
    <GaussianViewer
      sceneId={sceneId}
      shotId={shotId}
      tourId={tourId}
      lineageFromUrl={lineageFromUrl}
    />
  );
}
