"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import CommentSection from "@/components/viewer/CommentSection";
import OverlayPanel from "@/components/layout/OverlayPanel";
import { useAppShell } from "@/components/layout/AppShellContext";
import { useIsSceneOwner } from "@/hooks/viewer/useIsSceneOwner";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";

const GaussianViewerView = dynamic(
  () => import("@/components/features/viewer/GaussianViewerView"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[var(--nord-bg)]">
        <p className="text-sm text-[var(--nord-slate)]">Initialising viewer…</p>
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

/** Resolves the presigned view URL and renders a full-bleed viewer with overlay comments. */
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
  const {
    commentsOverlayOpen,
    setCommentsOverlayOpen,
    setViewerCommentsCount,
    commentsTriggerRef,
  } = useAppShell();

  const forkedFromSceneId =
    forkedFromSceneIdFromApi ?? lineageFromUrl?.forkedFromSceneId ?? null;
  const forkedFromUsername =
    forkedFromUsernameFromApi ?? lineageFromUrl?.forkedFromUsername ?? null;

  useEffect(() => {
    setViewerCommentsCount(commentsCount);
  }, [commentsCount, setViewerCommentsCount]);

  return (
    <div className="relative h-full w-full">
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

      {splatUrl && !error ? (
        <OverlayPanel
          open={commentsOverlayOpen}
          onClose={() => setCommentsOverlayOpen(false)}
          side="right"
          variant="floating"
          ariaLabel="Comments"
          returnFocusRef={commentsTriggerRef}
        >
          <CommentSection
            key={sceneId}
            sceneId={sceneId}
            initialCommentsCount={commentsCount}
            isSceneOwner={isSceneOwner}
            onCommentsCountChange={setCommentsCount}
            variant="overlay"
            onClose={() => setCommentsOverlayOpen(false)}
          />
        </OverlayPanel>
      ) : null}
    </div>
  );
}
