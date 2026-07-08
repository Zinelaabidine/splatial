import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";

import BookmarkButton from "@/components/viewer/BookmarkButton";
import EditButton from "@/components/viewer/EditButton";
import ForkCountBadge from "@/components/splatworks/ForkCountBadge";
import ReactionBar from "@/components/viewer/ReactionBar";
import RemixAttribution from "@/components/viewer/RemixAttribution";
import RemixButton from "@/components/viewer/RemixButton";
import RemixSuccessBanner from "@/components/viewer/RemixSuccessBanner";
import ShareButton from "@/components/viewer/ShareButton";
import type { ReactionSummary } from "@/types/api";

const LegacySplatViewer = dynamic(
  () => import("@/components/viewer/LegacySplatViewer"),
  { ssr: false },
);

type GaussianViewerViewProps = {
  sceneId: string;
  splatUrl: string | null;
  reactionSummary: ReactionSummary | null;
  isBookmarked: boolean;
  sceneName?: string;
  ownerUsername?: string;
  ownerDisplayName?: string;
  forkedFromSceneId?: string | null;
  forkedFromUsername?: string | null;
  forksCount?: number;
  error: string | null;
  loading: boolean;
  shotId?: string | null;
  tourId?: string | null;
  isSceneOwner?: boolean;
};

export default function GaussianViewerView({
  sceneId,
  splatUrl,
  reactionSummary,
  isBookmarked,
  sceneName,
  ownerUsername,
  ownerDisplayName,
  forkedFromSceneId,
  forkedFromUsername,
  forksCount = 0,
  error,
  loading,
  shotId,
  tourId,
  isSceneOwner = false,
}: GaussianViewerViewProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-sm text-slate-400">Loading scene…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="max-w-md text-sm text-red-400">{error}</p>
        <Link
          href="/scenes"
          className="text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
        >
          Back to Your Scenes
        </Link>
      </div>
    );
  }

  if (!splatUrl) return null;

  const showAttribution =
    forkedFromSceneId &&
    forkedFromUsername &&
    forkedFromUsername.trim() !== "";

  return (
    <div className="relative h-full w-full">
      <LegacySplatViewer
        splatUrl={splatUrl}
        sceneId={sceneId}
        shotId={shotId}
        tourId={tourId}
        isSceneOwner={isSceneOwner}
      />

      <Suspense fallback={null}>
        <RemixSuccessBanner />
      </Suspense>

      {/* Scene engagement — floating pill below the header, separate from the
          bottom-center viewer dock (Home / Tours / Shots / Trajectory). */}
      <div className="pointer-events-none absolute right-4 top-[4.25rem] z-[var(--z-canvas-overlay)]">
        <div className="sw-scene-actions-pill pointer-events-auto flex items-center">
          {isSceneOwner ? <EditButton sceneId={sceneId} /> : null}
          {reactionSummary ? (
            <ReactionBar key={sceneId} sceneId={sceneId} initialSummary={reactionSummary} />
          ) : null}
          <RemixButton sceneId={sceneId} sceneName={sceneName} />
          <BookmarkButton
            key={`${sceneId}-bookmark`}
            sceneId={sceneId}
            initialBookmarked={isBookmarked}
          />
          <ShareButton sceneId={sceneId} />
        </div>
      </div>

      {(showAttribution || forksCount > 0) && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-[var(--z-canvas-overlay)] flex flex-col items-center gap-2 px-4">
          {showAttribution ? (
            <div className="pointer-events-auto max-w-lg rounded-full border border-white/10 bg-black/70 px-4 py-2 shadow-lg backdrop-blur-md">
              <RemixAttribution
                forkedFromSceneId={forkedFromSceneId}
                forkedFromUsername={forkedFromUsername}
              />
            </div>
          ) : null}
          {forksCount > 0 ? (
            <ForkCountBadge
              forksCount={forksCount}
              className="pointer-events-auto rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-white/80 shadow-lg backdrop-blur-md"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
