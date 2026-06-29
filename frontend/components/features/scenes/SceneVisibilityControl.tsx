"use client";

import { Globe, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SceneVisibility } from "@/types/api";

type SceneVisibilityBadgeProps = {
  visibility: SceneVisibility;
  className?: string;
};

export function SceneVisibilityBadge({ visibility, className }: SceneVisibilityBadgeProps) {
  const isPublic = visibility === "PUBLIC";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isPublic
          ? "bg-sky-950/60 text-sky-300 ring-1 ring-sky-800/60"
          : "bg-[#303030] text-[#a3a3a3] ring-1 ring-[#404040]",
        className,
      )}
    >
      {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      {isPublic ? "Public" : "Private"}
    </span>
  );
}

type SceneVisibilityToggleProps = {
  visibility: SceneVisibility;
  disabled?: boolean;
  onToggle: (nextVisibility: SceneVisibility) => void;
  className?: string;
};

export function SceneVisibilityToggle({
  visibility,
  disabled = false,
  onToggle,
  className,
}: SceneVisibilityToggleProps) {
  const isPublic = visibility === "PUBLIC";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#d4d4d4]">Visibility</p>
          <p className="text-[11px] text-[#909090]">
            {isPublic ? "Anyone can discover this scene." : "Only you can see this scene."}
          </p>
        </div>
        <SceneVisibilityBadge visibility={visibility} />
      </div>
      <div
        className="inline-flex rounded-lg border border-[#404040] bg-[#262626] p-0.5"
        role="group"
        aria-label="Scene visibility"
      >
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !isPublic}
          aria-pressed={!isPublic}
          onClick={() => onToggle("PRIVATE")}
          className={cn(
            "h-7 flex-1 rounded-md px-3 text-xs font-medium",
            !isPublic
              ? "bg-[#404040] text-white hover:bg-[#404040]"
              : "text-[#909090] hover:bg-transparent hover:text-[#d4d4d4]",
          )}
        >
          Private
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || isPublic}
          aria-pressed={isPublic}
          onClick={() => onToggle("PUBLIC")}
          className={cn(
            "h-7 flex-1 rounded-md px-3 text-xs font-medium",
            isPublic
              ? "bg-sky-900/70 text-sky-100 hover:bg-sky-900/70"
              : "text-[#909090] hover:bg-transparent hover:text-[#d4d4d4]",
          )}
        >
          Public
        </Button>
      </div>
    </div>
  );
}
