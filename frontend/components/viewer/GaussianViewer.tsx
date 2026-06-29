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
  tourId?: string | null;
  lineageFromUrl?: {
    forkedFromSceneId: string | null;
    forkedFromUsername: string | null;
  };
};

/** Resolves the presigned view URL and renders the viewer with comments below. */
export default function GaussianViewer({
  sceneId,
  shotId,
  tourId,
  lineageFromUrl,
}: GaussianViewerProps) {
  const {
    splatUrl,
    reactionSummary,
    isBookmarked,
    commentsCount,
    setCommentsCount,
    sceneName,
    forkedFromSceneId: forkedFromSceneIdFromApi,
    forkedFromUsername: forkedFromUsernameFromApi,
    forksCount,
    error,
    loading,
  } = useSceneViewUrl(sceneId);
  const isSceneOwner = useIsSceneOwner(sceneId);

  const forkedFromSceneId =
    forkedFromSceneIdFromApi ?? lineageFromUrl?.forkedFromSceneId ?? null;
  const forkedFromUsername =
    forkedFromUsernameFromApi ?? lineageFromUrl?.forkedFromUsername ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="h-[min(60vh,720px)] min-h-[320px] shrink-0">
        <GaussianViewerView
          sceneId={sceneId}
          splatUrl={splatUrl}
          reactionSummary={reactionSummary}
          isBookmarked={isBookmarked}
          sceneName={sceneName}
          forkedFromSceneId={forkedFromSceneId}
          forkedFromUsername={forkedFromUsername}
          forksCount={forksCount}
          error={error}
          loading={loading}
          shotId={shotId}
          tourId={tourId}
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
