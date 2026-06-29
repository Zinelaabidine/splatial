"use client";

import { useCallback, useRef, useState } from "react";
import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { addBookmark, removeBookmark } from "@/services/bookmarksService";
import { cn } from "@/lib/utils";

type BookmarkButtonProps = {
  sceneId: string;
  initialBookmarked: boolean;
};

export default function BookmarkButton({
  sceneId,
  initialBookmarked,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const handleToggle = useCallback(async () => {
    if (pending) return;

    const previous = bookmarked;
    const next = !bookmarked;
    const requestId = ++requestIdRef.current;

    setBookmarked(next);
    setPending(true);
    setError(null);

    try {
      const result = next
        ? await addBookmark(sceneId)
        : await removeBookmark(sceneId);
      if (requestId === requestIdRef.current) {
        setBookmarked(result.bookmarked);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setBookmarked(previous);
        if (err instanceof ApiRequestError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Could not update bookmark.");
        }
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setPending(false);
      }
    }
  }, [bookmarked, pending, sceneId]);

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? "Saved — remove bookmark" : "Save scene"}
        title={bookmarked ? "Saved" : "Save"}
        onClick={() => void handleToggle()}
        className={cn(
          "h-auto gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-2 text-white shadow-lg backdrop-blur-md hover:bg-white/10",
          bookmarked && "bg-white/15 ring-1 ring-white/30",
        )}
      >
        <Bookmark
          className="h-4 w-4"
          strokeWidth={bookmarked ? 0 : 1.75}
          fill={bookmarked ? "currentColor" : "none"}
        />
        <span className="text-xs font-medium">{bookmarked ? "Saved" : "Save"}</span>
      </Button>
      {error ? (
        <p className="max-w-xs rounded-md bg-black/80 px-2 py-1 text-center text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
