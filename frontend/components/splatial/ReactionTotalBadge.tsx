import { topReactionEmoji } from "@/lib/reactions/constants";
import { cn } from "@/lib/utils";
import type { ReactionCounts } from "@/types/api";

type ReactionTotalBadgeProps = {
  reactionsTotal?: number;
  reactionCounts?: ReactionCounts;
  className?: string;
  chip?: boolean;
};

export default function ReactionTotalBadge({
  reactionsTotal = 0,
  reactionCounts,
  className,
  chip = false,
}: ReactionTotalBadgeProps) {
  if (reactionsTotal <= 0) return null;

  const emoji = topReactionEmoji(reactionCounts, reactionsTotal);

  return (
    <span
      className={cn(
        chip
          ? "sw-stat-chip"
          : "inline-flex items-center gap-1 font-sw-mono text-[11px] text-[var(--nord-ink)]",
        className,
      )}
      aria-label={`${reactionsTotal} reactions`}
    >
      <span aria-hidden>{emoji}</span>
      <span>{reactionsTotal}</span>
    </span>
  );
}
