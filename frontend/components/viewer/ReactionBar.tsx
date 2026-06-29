"use client";

import { useCallback, useRef, useState } from "react";

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

export default function ReactionBar({ sceneId, initialSummary }: ReactionBarProps) {
  const [summary, setSummary] = useState(() => normalizeReactionSummary(initialSummary));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

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
    },
    [pending, sceneId, summary],
  );

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <div
        className="flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2 py-1.5 shadow-lg backdrop-blur-md"
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
                "h-auto min-w-[2.75rem] flex-col gap-0 rounded-full px-2 py-1 text-white hover:bg-white/10",
                selected && "bg-white/15 ring-1 ring-white/30",
              )}
            >
              <span className="text-lg leading-none" aria-hidden>
                {emoji}
              </span>
              <span className="font-sw-mono text-[10px] leading-tight text-white/80">
                {count}
              </span>
            </Button>
          );
        })}
        <span className="ml-1 border-l border-white/10 pl-2 font-sw-mono text-xs text-white/70">
          {summary.reactionsTotal}
        </span>
      </div>
      {error ? (
        <p className="max-w-xs rounded-md bg-black/80 px-2 py-1 text-center text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
