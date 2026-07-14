"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  computeOptimisticReactionSummary,
  normalizeReactionSummary,
  REACTION_ORDER,
  REACTIONS,
} from "@/lib/reactions/constants";
import { removeReaction, setReaction } from "@/services/reactionsService";
import { cn } from "@/lib/utils";
import type { ReactionSummary, ReactionType } from "@/types/api";

type ReactionBarProps = {
  sceneId: string;
  initialSummary: ReactionSummary;
};

/**
 * Reaction picker for a scene.
 *
 * Collapsed by default into a single "React" trigger — five always-visible
 * emoji buttons (all reading 0 on most scenes) previously competed with
 * Remix/Save/Share for attention regardless of whether anyone had reacted.
 * Clicking the trigger expands the full row above it; picking a reaction
 * (or clicking outside) collapses it again.
 */
export default function ReactionBar({ sceneId, initialSummary }: ReactionBarProps) {
  const [summary, setSummary] = useState(() => normalizeReactionSummary(initialSummary));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const requestIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  const handleReactionClick = useCallback(
    async (type: ReactionType) => {
      if (pending) return;

      const previous = summary;
      const isToggleOff = summary.myReaction === type;
      const optimistic = computeOptimisticReactionSummary(summary, type);
      const requestId = ++requestIdRef.current;

      setSummary(optimistic);
      setPending(true);
      setError(null);

      try {
        const result = isToggleOff
          ? await removeReaction(sceneId)
          : await setReaction(sceneId, type);
        if (requestId === requestIdRef.current) {
          setSummary(normalizeReactionSummary(result));
        }
      } catch (err) {
        if (requestId === requestIdRef.current) {
          setSummary(previous);
          if (err instanceof ApiRequestError) {
            setError(err.message);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("Could not update reaction.");
          }
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setPending(false);
        }
      }
      setExpanded(false);
    },
    [pending, sceneId, summary],
  );

  const myReactionEmoji = summary.myReaction
    ? REACTIONS[summary.myReaction].emoji
    : null;

  return (
    <div ref={containerRef} className="pointer-events-auto relative flex flex-col items-center gap-1.5">
      {expanded ? (
        <div
          className="absolute bottom-full mb-2 flex items-center gap-1 rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] px-2 py-1.5 shadow-lg backdrop-blur-md"
          role="toolbar"
          aria-label="Scene reactions"
        >
          {REACTION_ORDER.map((type) => {
            const { emoji, label } = REACTIONS[type];
            const count = summary.reactionCounts[type] ?? 0;
            const selected = summary.myReaction === type;

            return (
              <Button
                key={type}
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-pressed={selected}
                aria-label={`${label}${count > 0 ? `, ${count}` : ""}`}
                title={label}
                onClick={() => void handleReactionClick(type)}
                className={cn(
                  "h-auto min-w-[2.75rem] flex-col gap-0 rounded-full px-2 py-1 text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]",
                  selected && "bg-[var(--nord-tint)] ring-1 ring-[var(--nord-hairline)]",
                )}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {emoji}
                </span>
                <span className="font-sw-mono text-[10px] leading-tight text-[var(--nord-ink)]">
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-expanded={expanded}
        aria-label={
          summary.reactionsTotal > 0
            ? `React — ${summary.reactionsTotal} reaction${summary.reactionsTotal === 1 ? "" : "s"}`
            : "React"
        }
        title="React"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "h-auto gap-1.5 rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] px-3 py-2 text-[var(--nord-cta-fg)] shadow-lg backdrop-blur-md hover:bg-[var(--nord-tint)]",
          expanded && "bg-[var(--nord-tint)] ring-1 ring-[var(--nord-hairline)]",
        )}
      >
        <span className="text-base leading-none" aria-hidden>
          {myReactionEmoji ?? "🤍"}
        </span>
        <span className="text-xs font-medium">
          {summary.reactionsTotal > 0 ? summary.reactionsTotal : "React"}
        </span>
      </Button>

      {error ? (
        <p className="max-w-xs rounded-md bg-[var(--nord-scrim)] px-2 py-1 text-center text-xs text-[var(--nord-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
