"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  computeOptimisticReactionSummary,
  normalizeReactionSummary,
  REACTION_ORDER,
  REACTIONS,
} from "@/lib/reactions/constants";
import {
  removeCommentReaction,
  setCommentReaction,
} from "@/services/reactionsService";
import { cn } from "@/lib/utils";
import type { ReactionSummary, ReactionType } from "@/types/api";

type CommentReactionBarProps = {
  sceneId: string;
  commentId: string;
  initialSummary: ReactionSummary;
  className?: string;
};

/**
 * Compact reaction picker for a single comment — same five-reaction
 * vocabulary as ReactionBar (scene reactions), styled inline to sit next to
 * the "Reply" / "View replies" row instead of floating over the viewer.
 */
export default function CommentReactionBar({
  sceneId,
  commentId,
  initialSummary,
  className,
}: CommentReactionBarProps) {
  const [summary, setSummary] = useState(() => normalizeReactionSummary(initialSummary));
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
          ? await removeCommentReaction(sceneId, commentId)
          : await setCommentReaction(sceneId, commentId, type);
        if (requestId === requestIdRef.current) {
          setSummary(normalizeReactionSummary(result));
        }
      } catch (err) {
        if (requestId === requestIdRef.current) {
          setSummary(previous);
          setError(
            err instanceof ApiRequestError || err instanceof Error
              ? err.message
              : "Could not update reaction.",
          );
        }
      } finally {
        if (requestId === requestIdRef.current) setPending(false);
      }
      setExpanded(false);
    },
    [pending, sceneId, commentId, summary],
  );

  const myReactionEmoji = summary.myReaction ? REACTIONS[summary.myReaction].emoji : null;

  return (
    <div ref={containerRef} className={cn("relative inline-flex items-center", className)}>
      {expanded ? (
        <div
          className="absolute bottom-full left-0 z-10 mb-1.5 flex items-center gap-0.5 rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-1.5 py-1 shadow-lg"
          role="toolbar"
          aria-label="Comment reactions"
        >
          {REACTION_ORDER.map((type) => {
            const { emoji, label } = REACTIONS[type];
            const selected = summary.myReaction === type;
            return (
              <button
                key={type}
                type="button"
                disabled={pending}
                aria-pressed={selected}
                aria-label={label}
                title={label}
                onClick={() => void handleReactionClick(type)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:bg-[var(--nord-tint)]",
                  selected && "bg-[var(--nord-tint)] ring-1 ring-[var(--nord-hairline)]",
                )}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-1 font-sw-mono text-[11px] text-[var(--nord-slate)] hover:text-[var(--nord-ink)]",
          summary.myReaction && "text-[var(--nord-teal)] hover:text-[var(--nord-teal)]",
        )}
      >
        <span aria-hidden>{myReactionEmoji ?? "👍"}</span>
        <span>
          {summary.myReaction ? REACTIONS[summary.myReaction].label : "React"}
          {summary.reactionsTotal > 0 ? ` · ${summary.reactionsTotal}` : ""}
        </span>
      </button>

      {error ? (
        <p className="absolute top-full left-0 mt-1 whitespace-nowrap text-[10px] text-[var(--nord-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
