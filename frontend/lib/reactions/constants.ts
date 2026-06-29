import type { ReactionCounts, ReactionSummary, ReactionType } from "@/types/api";

export type ReactionMeta = {
  type: ReactionType;
  emoji: string;
  label: string;
};

/** Display order for reaction buttons and top-reaction selection. */
export const REACTION_ORDER: readonly ReactionType[] = [
  "like",
  "love",
  "wow",
  "fire",
  "haha",
] as const;

export const REACTIONS: Record<ReactionType, Omit<ReactionMeta, "type">> = {
  like: { emoji: "👍", label: "Like" },
  love: { emoji: "❤️", label: "Love" },
  wow: { emoji: "😮", label: "Wow" },
  fire: { emoji: "🔥", label: "Fire" },
  haha: { emoji: "😂", label: "Haha" },
};

export function emptyReactionCounts(): ReactionCounts {
  return {
    like: 0,
    love: 0,
    wow: 0,
    fire: 0,
    haha: 0,
  };
}

export function normalizeReactionCounts(
  counts: Partial<ReactionCounts> | undefined,
): ReactionCounts {
  const base = emptyReactionCounts();
  if (!counts) return base;
  for (const type of REACTION_ORDER) {
    const value = counts[type];
    if (typeof value === "number" && Number.isFinite(value)) {
      base[type] = Math.max(0, Math.floor(value));
    }
  }
  return base;
}

export function normalizeReactionSummary(
  partial: Partial<ReactionSummary> | undefined,
): ReactionSummary {
  const reactionCounts = normalizeReactionCounts(partial?.reactionCounts);
  const reactionsTotal =
    typeof partial?.reactionsTotal === "number" && Number.isFinite(partial.reactionsTotal)
      ? Math.max(0, Math.floor(partial.reactionsTotal))
      : Object.values(reactionCounts).reduce((sum, n) => sum + n, 0);
  const myReaction =
    partial?.myReaction != null && REACTION_ORDER.includes(partial.myReaction)
      ? partial.myReaction
      : null;

  return { reactionCounts, reactionsTotal, myReaction };
}

/** Emoji for the highest-count reaction; falls back to fire when total is zero. */
export function topReactionEmoji(
  counts: ReactionCounts | undefined,
  reactionsTotal: number | undefined,
): string {
  if (!counts || !reactionsTotal || reactionsTotal <= 0) {
    return REACTIONS.fire.emoji;
  }

  let topType: ReactionType = REACTION_ORDER[0];
  let topCount = 0;
  for (const type of REACTION_ORDER) {
    const count = counts[type] ?? 0;
    if (count > topCount) {
      topCount = count;
      topType = type;
    }
  }

  return REACTIONS[topType].emoji;
}

export function computeOptimisticReactionSummary(
  current: ReactionSummary,
  clickedType: ReactionType,
): ReactionSummary {
  const counts = { ...current.reactionCounts };
  let total = current.reactionsTotal;
  const isToggleOff = current.myReaction === clickedType;

  if (isToggleOff) {
    counts[clickedType] = Math.max(0, counts[clickedType] - 1);
    total = Math.max(0, total - 1);
    return {
      reactionCounts: counts,
      reactionsTotal: total,
      myReaction: null,
    };
  }

  if (current.myReaction) {
    counts[current.myReaction] = Math.max(0, counts[current.myReaction] - 1);
    counts[clickedType] = counts[clickedType] + 1;
    return {
      reactionCounts: counts,
      reactionsTotal: total,
      myReaction: clickedType,
    };
  }

  counts[clickedType] = counts[clickedType] + 1;
  return {
    reactionCounts: counts,
    reactionsTotal: total + 1,
    myReaction: clickedType,
  };
}
