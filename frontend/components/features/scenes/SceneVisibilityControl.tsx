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
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#9a9aa2] ring-1 ring-white/10",
        isPublic ? "bg-white/[0.06]" : "bg-white/[0.03]",
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
          "h-6 flex-1 rounded-full px-3 text-[11px] font-medium",
          !isPublic
            ? "bg-white text-[#0a0a0b] hover:bg-white"
            : "text-[#84848c] hover:bg-transparent hover:text-white",
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
          "h-6 flex-1 rounded-full px-3 text-[11px] font-medium",
          isPublic
            ? "bg-white text-[#0a0a0b] hover:bg-white"
            : "text-[#84848c] hover:bg-transparent hover:text-white",
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
