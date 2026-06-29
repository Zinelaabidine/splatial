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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm",
        isPublic
          ? "bg-sky-400/15 text-sky-200 ring-1 ring-sky-300/40"
          : "bg-white/10 text-[#b9c2d4] ring-1 ring-white/15",
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
  /** Streamlined glass pill without the descriptive text rows (used on cards). */
  compact?: boolean;
};

export function SceneVisibilityToggle({
  visibility,
  disabled = false,
  onToggle,
  className,
  compact = false,
}: SceneVisibilityToggleProps) {
  const isPublic = visibility === "PUBLIC";

  const pill = (
    <div
      className={cn(
        "sw-control inline-flex rounded-full p-0.5",
        compact && "w-full",
      )}
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
          "h-7 flex-1 rounded-full px-3 text-xs font-medium",
          !isPublic
            ? "bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white/15"
            : "text-[#9aa6bd] hover:bg-transparent hover:text-white",
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
          "h-7 flex-1 rounded-full px-3 text-xs font-medium",
          isPublic
            ? "bg-gradient-to-r from-sky-500/70 to-indigo-500/70 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-sky-500/70 hover:to-indigo-500/70"
            : "text-[#9aa6bd] hover:bg-transparent hover:text-white",
        )}
      >
        Public
      </Button>
    </div>
  );

  if (compact) {
    return <div className={cn("w-full", className)}>{pill}</div>;
  }

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
      {pill}
    </div>
  );
}
