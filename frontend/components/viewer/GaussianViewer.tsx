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
    ownerUsername,
    ownerDisplayName,
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

  // Side-by-side on large screens: the canvas fills the remaining width and
  // comments live in a fixed-width rail that scrolls independently, full
  // height. The old layout stacked a fixed-height viewer block above a
  // full-width comment section, so comments only appeared after scrolling
  // the whole page down — disconnected from the scene they're about.
  // `<main>` in AppShell is `flex-1` inside a `h-screen` column, so `h-full`
  // here resolves to a real pixel height, not 0.
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="min-h-[320px] min-w-0 flex-1">
        <GaussianViewerView
          sceneId={sceneId}
          splatUrl={splatUrl}
          reactionSummary={reactionSummary}
          isBookmarked={isBookmarked}
          sceneName={sceneName}
          ownerUsername={ownerUsername}
          ownerDisplayName={ownerDisplayName}
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
        <div className="h-[45vh] min-h-[280px] shrink-0 border-t border-[#2a2a2a] lg:h-full lg:w-[380px] lg:border-l lg:border-t-0">
          <CommentSection
            key={sceneId}
            sceneId={sceneId}
            initialCommentsCount={commentsCount}
            isSceneOwner={isSceneOwner}
            onCommentsCountChange={setCommentsCount}
          />
        </div>
      ) : null}
    </div>
  );
}
