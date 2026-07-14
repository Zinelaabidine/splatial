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
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
        isPublic
          ? "bg-[var(--nord-success)] text-[var(--nord-success)] ring-[var(--nord-success)]"
          : "bg-[var(--nord-tint)] text-[var(--nord-ink)] ring-[var(--nord-hairline)]",
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
            ? "bg-[var(--nord-surface)] text-[var(--nord-ink)] hover:bg-[var(--nord-surface)]"
            : "text-[var(--nord-slate)] hover:bg-transparent hover:text-[var(--nord-ink)]",
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
            ? "bg-[var(--nord-surface)] text-[var(--nord-ink)] hover:bg-[var(--nord-surface)]"
            : "text-[var(--nord-slate)] hover:bg-transparent hover:text-[var(--nord-ink)]",
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
          <p className="text-xs font-medium text-[var(--nord-ink)]">Visibility</p>
          <p className="text-[11px] text-[var(--nord-slate)]">
            {isPublic ? "Anyone can discover this scene." : "Only you can see this scene."}
          </p>
        </div>
        <SceneVisibilityBadge visibility={visibility} />
      </div>
      {pill}
    </div>
  );
}
