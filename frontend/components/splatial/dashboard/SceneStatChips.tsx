import CommentCountBadge from "@/components/splatial/CommentCountBadge";
import ForkCountBadge from "@/components/splatial/ForkCountBadge";
import ReactionTotalBadge from "@/components/splatial/ReactionTotalBadge";
import { cn } from "@/lib/utils";
import type { ReactionCounts } from "@/types/api";
import type { DashboardScene } from "@/types/splatial";

type SceneStatChipsProps = {
  forksCount?: number;
  commentsCount?: number;
  reactionsTotal?: number;
  reactionCounts?: ReactionCounts;
  className?: string;
  /** Show zero-state placeholder for richer featured cards. */
  showEmpty?: boolean;
};

export default function SceneStatChips({
  forksCount,
  commentsCount,
  reactionsTotal,
  reactionCounts,
  className,
  showEmpty = false,
}: SceneStatChipsProps) {
  const hasStats =
    (forksCount != null && forksCount > 0) ||
    (commentsCount != null && commentsCount > 0) ||
    (reactionsTotal != null && reactionsTotal > 0);

  if (!hasStats && !showEmpty) return null;

  if (!hasStats && showEmpty) {
    return (
      <p className={cn("text-xs text-[var(--nord-slate)]", className)}>
        No engagement yet — publish to start collecting reactions.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <ForkCountBadge forksCount={forksCount} chip />
      <CommentCountBadge commentsCount={commentsCount} chip />
      <ReactionTotalBadge
        reactionsTotal={reactionsTotal}
        reactionCounts={reactionCounts}
        chip
      />
    </div>
  );
}

/** Compact inline engagement summary for featured metadata row. */
export function SceneEngagementSummary({
  scene,
  className,
}: {
  scene: DashboardScene;
  className?: string;
}) {
  const items: string[] = [];

  if (scene.forksCount && scene.forksCount > 0) {
    items.push(`${scene.forksCount} remix${scene.forksCount === 1 ? "" : "es"}`);
  }
  if (scene.commentsCount && scene.commentsCount > 0) {
    items.push(`${scene.commentsCount} comment${scene.commentsCount === 1 ? "" : "s"}`);
  }
  if (scene.reactionsTotal && scene.reactionsTotal > 0) {
    items.push(`${scene.reactionsTotal} reaction${scene.reactionsTotal === 1 ? "" : "s"}`);
  }

  const summary =
    items.length > 0 ? items.join(" · ") : "No engagement yet";

  return (
    <p className={cn("text-sm text-[var(--nord-ink)]", className)}>
      {summary}
      {scene.caption ? (
        <>
          <span className="mx-2 text-[var(--nord-slate-soft)]">|</span>
          <span className="font-sw-mono text-xs text-[var(--nord-slate)]">{scene.caption}</span>
        </>
      ) : null}
    </p>
  );
}
