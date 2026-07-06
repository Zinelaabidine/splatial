"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShareButtonProps = {
  sceneId: string;
};

/** Copies the current scene's viewer URL to the clipboard. */
export default function ShareButton({ sceneId }: ShareButtonProps) {
  const [notice, setNotice] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/scenes/view?id=${encodeURIComponent(sceneId)}`
        : "";
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
    } catch {
      setNotice("Copy failed");
    }
    window.setTimeout(() => setNotice(null), 2000);
  }, [sceneId]);

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Share scene"
        title="Share"
        onClick={() => void handleShare()}
        className={cn(
          "h-auto gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-2 text-white shadow-lg backdrop-blur-md hover:bg-white/10",
        )}
      >
        <Share2 className="h-4 w-4" strokeWidth={1.75} />
        <span className="text-xs font-medium">Share</span>
      </Button>
      {notice ? (
        <p className="max-w-xs rounded-md bg-black/80 px-2 py-1 text-center text-xs text-white/80">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
