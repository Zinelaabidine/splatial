"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShareButtonProps = {
  sceneId: string;
  sceneName?: string;
};

/** Copies or natively shares the current scene's viewer URL. */
export default function ShareButton({ sceneId, sceneName }: ShareButtonProps) {
  const [notice, setNotice] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/scenes/view?id=${encodeURIComponent(sceneId)}`
        : "";
    const title = sceneName?.trim() || "Splatworks scene";

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title,
          text: `Check out ${title} on Splatworks`,
          url,
        });
        setNotice("Shared");
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied");
      } catch {
        setNotice("Copy failed");
      }
    }
    window.setTimeout(() => setNotice(null), 2000);
  }, [sceneId, sceneName]);

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
          "h-auto gap-1.5 rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] px-3 py-2 text-[var(--nord-cta-fg)] shadow-lg backdrop-blur-md hover:bg-[var(--nord-tint)]",
        )}
      >
        <Share2 className="h-4 w-4" strokeWidth={1.75} />
        <span className="text-xs font-medium">Share</span>
      </Button>
      {notice ? (
        <p className="max-w-xs rounded-md bg-[var(--nord-scrim)] px-2 py-1 text-center text-xs text-[var(--nord-cta-fg)]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
