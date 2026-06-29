"use client";

import dynamic from "next/dynamic";

import CommentSection from "@/components/viewer/CommentSection";
import { useIsSceneOwner } from "@/hooks/viewer/useIsSceneOwner";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";

const GaussianViewerView = dynamic(
  () => import("@/components/features/viewer/GaussianViewerView"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(60vh,720px)] items-center justify-center bg-black">
        <p className="text-sm text-slate-400">Initialising viewer…</p>
      </div>
    ),
  },
);

type GaussianViewerProps = {
  sceneId: string;
  shotId?: string | null;
};

/** Resolves the presigned view URL and renders the viewer with comments below. */
export default function GaussianViewer({ sceneId, shotId }: GaussianViewerProps) {
  const {
    splatUrl,
    reactionSummary,
    isBookmarked,
    commentsCount,
    setCommentsCount,
    error,
    loading,
  } = useSceneViewUrl(sceneId);
  const isSceneOwner = useIsSceneOwner(sceneId);

  return (
    <div className="flex min-h-full flex-col">
      <div className="h-[min(60vh,720px)] min-h-[320px] shrink-0">
        <GaussianViewerView
          sceneId={sceneId}
          splatUrl={splatUrl}
          reactionSummary={reactionSummary}
          isBookmarked={isBookmarked}
          error={error}
          loading={loading}
          shotId={shotId}
          isSceneOwner={isSceneOwner}
        />
      </div>

      {splatUrl && !error ? (
        <CommentSection
          key={sceneId}
          sceneId={sceneId}
          initialCommentsCount={commentsCount}
          isSceneOwner={isSceneOwner}
          onCommentsCountChange={setCommentsCount}
        />
      ) : null}
    </div>
  );
}
