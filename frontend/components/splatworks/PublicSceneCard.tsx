"use client";

import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import CommentCountBadge from "@/components/splatworks/CommentCountBadge";
import ForkCountBadge from "@/components/splatworks/ForkCountBadge";
import ReactionTotalBadge from "@/components/splatworks/ReactionTotalBadge";
import FeedAuthorRow from "@/components/splatworks/FeedAuthorRow";
import SceneTaxonomyDisplay from "@/components/features/scenes/SceneTaxonomyDisplay";
import { cn } from "@/lib/utils";
import type { DashboardScene } from "@/types/splatworks";

const COMPLETED_TILE =
  "linear-gradient(150deg, rgba(52,211,153,0.18), rgba(8,16,24,0.6))";

type PublicSceneCardProps = {
  scene: DashboardScene;
  onClick: (scene: DashboardScene) => void;
  ownerUsername?: string;
  ownerDisplayName?: string;
  ownerAvatarUrl?: string | null;
};

export default function PublicSceneCard({
  scene,
  onClick,
  ownerUsername,
  ownerDisplayName,
  ownerAvatarUrl,
}: PublicSceneCardProps) {
  const isViewable = scene.status === "completed";
  const showAuthor =
    ownerUsername !== undefined || ownerDisplayName !== undefined;

  return (
    <article
      role={isViewable ? "button" : undefined}
      tabIndex={isViewable ? 0 : undefined}
      onClick={isViewable ? () => onClick(scene) : undefined}
      onKeyDown={
        isViewable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(scene);
              }
            }
          : undefined
      }
      className={cn(
        "sw-glass-card group relative rounded-2xl",
        isViewable && "sw-glass-card-hover cursor-pointer",
      )}
    >
      {scene.status === "completed" && scene.thumbnailUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.thumbnailUrl}
            alt=""
            className="h-[180px] w-full rounded-t-2xl object-cover"
          />
        </>
      ) : scene.status === "completed" && scene.preview ? (
        <PointCloudThumbnail
          preview={scene.preview}
          height={180}
          variant="dark-card"
          className="rounded-t-2xl"
        />
      ) : (
        <div
          className="flex h-[180px] items-center justify-center rounded-t-2xl px-5 text-center"
          style={{ background: COMPLETED_TILE }}
        >
          <span className="font-sw-mono text-[10px] font-semibold uppercase tracking-wider text-[#6ee7b7]">
            {scene.title}
          </span>
        </div>
      )}

      <div className="rounded-b-2xl p-3">
        {showAuthor ? (
          <FeedAuthorRow
            ownerUsername={ownerUsername ?? ""}
            ownerDisplayName={ownerDisplayName ?? ""}
            ownerAvatarUrl={ownerAvatarUrl}
            className="mb-2.5"
          />
        ) : null}
        <h3 className="truncate text-[15px] font-semibold text-white">{scene.title}</h3>
        <SceneTaxonomyDisplay
          category={scene.category}
          tags={scene.tags}
          className="mt-1.5"
        />
        <p className="mt-1 font-sw-mono text-xs text-[#9aa6bd]">{scene.caption}</p>
        {(scene.forksCount != null && scene.forksCount > 0) ||
        (scene.commentsCount != null && scene.commentsCount > 0) ||
        (scene.reactionsTotal != null && scene.reactionsTotal > 0) ? (
          <div className="mt-1.5 flex items-center gap-2">
            <ForkCountBadge forksCount={scene.forksCount} />
            <CommentCountBadge commentsCount={scene.commentsCount} />
            <ReactionTotalBadge
              reactionsTotal={scene.reactionsTotal}
              reactionCounts={scene.reactionCounts}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
