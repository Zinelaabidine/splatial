"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";

import SceneCreatorRow from "@/components/splatial/dashboard/SceneCreatorRow";
import SceneStatChips, {
  SceneEngagementSummary,
} from "@/components/splatial/dashboard/SceneStatChips";
import PointCloudThumbnail from "@/components/splatial/PointCloudThumbnail";
import SceneTaxonomyDisplay from "@/components/features/scenes/SceneTaxonomyDisplay";
import { SceneVisibilityBadge } from "@/components/features/scenes/SceneVisibilityControl";
import { cn } from "@/lib/utils";
import type { DashboardScene } from "@/types/splatial";

type FeaturedSceneCardProps = {
  scene: DashboardScene;
  onClick: (scene: DashboardScene) => void;
  className?: string;
};

export default function FeaturedSceneCard({
  scene,
  onClick,
  className,
}: FeaturedSceneCardProps) {
  const visibility = scene.visibility ?? "PRIVATE";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onClick(scene)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(scene);
        }
      }}
      className={cn(
        "sw-featured-card group relative h-full min-h-[280px] cursor-pointer overflow-hidden rounded-2xl",
        className,
      )}
    >
      <div className="grid h-full min-h-[280px] grid-cols-1 md:grid-cols-[1.15fr_1fr]">
        <div className="relative h-full min-h-[200px] overflow-hidden md:min-h-0">
          {scene.thumbnailUrl ? (
            <>
              {/* Presigned S3 URLs — not compatible with next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </>
          ) : scene.preview ? (
            <PointCloudThumbnail
              preview={scene.preview}
              height="100%"
              variant="dark-card"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--nord-bg)]">
              <span className="font-sw-mono text-xs uppercase tracking-wider text-[var(--nord-slate)]">
                {scene.title}
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--nord-scrim)] via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-[var(--nord-scrim)]" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--nord-teal)] bg-[var(--nord-pine)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--nord-teal)]">
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Featured
          </span>
        </div>

        <div className="flex flex-col justify-between bg-[var(--nord-bg)] p-4 sm:p-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <SceneCreatorRow stacked />
              <SceneVisibilityBadge visibility={visibility} />
            </div>

            <h2 className="text-lg font-semibold leading-snug text-[var(--nord-ink)] sm:text-[1.35rem]">
              {scene.title}
            </h2>

            <SceneEngagementSummary scene={scene} className="mt-2" />

            <SceneTaxonomyDisplay
              category={scene.category}
              tags={scene.tags}
              className="mt-3"
            />

            <SceneStatChips
              forksCount={scene.forksCount}
              commentsCount={scene.commentsCount}
              reactionsTotal={scene.reactionsTotal}
              reactionCounts={scene.reactionCounts}
              className="mt-3"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--nord-hairline)] pt-4">
            <p className="text-xs leading-relaxed text-[var(--nord-slate)]">
              Highest engagement in your library
            </p>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--nord-ink)] transition-colors group-hover:text-[var(--nord-teal)]">
              Open scene
              <ArrowUpRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2}
              />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
