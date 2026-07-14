"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Send, Trash2, XCircle } from "lucide-react";

import SceneStatChips from "@/components/splatworks/dashboard/SceneStatChips";
import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import StatusDot, { STATUS_LABELS } from "@/components/splatworks/StatusDot";
import { SceneVisibilityBadge } from "@/components/features/scenes/SceneVisibilityControl";
import { Button } from "@/components/ui/button";
import { isActiveGpuJobStatus } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import type { SubmitJobOptions } from "@/services/jobsService";
import type { DashboardScene } from "@/types/splatworks";

type DashboardSceneListRowProps = {
  scene: DashboardScene;
  onClick: (scene: DashboardScene) => void;
  onSubmitScene?: (scene: DashboardScene, options?: SubmitJobOptions) => void;
  onCancelScene?: (scene: DashboardScene) => void;
  onDeleteScene?: (scene: DashboardScene) => void;
  onEditScene?: (scene: DashboardScene) => void;
  submitting?: boolean;
  cancelling?: boolean;
};

function canSubmitScene(scene: DashboardScene): boolean {
  return (
    scene.apiStatus === "UPLOADED" ||
    scene.apiStatus === "FAILED" ||
    scene.apiStatus === "CANCELLED"
  );
}

export default function DashboardSceneListRow({
  scene,
  onClick,
  onSubmitScene,
  onCancelScene,
  onDeleteScene,
  onEditScene,
  submitting = false,
  cancelling = false,
}: DashboardSceneListRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const visibility = scene.visibility ?? "PRIVATE";
  const isViewable = scene.status === "completed";
  const showSubmit = canSubmitScene(scene);
  const showCancel = isActiveGpuJobStatus(scene.apiStatus);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <article
      role={isViewable ? "button" : undefined}
      tabIndex={isViewable ? 0 : undefined}
      onClick={isViewable ? () => onClick(scene) : undefined}
      onKeyDown={
        isViewable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(scene);
              }
            }
          : undefined
      }
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-bg)] px-3 py-3 transition-all",
        isViewable && "cursor-pointer hover:border-[var(--nord-hairline)] hover:bg-[var(--nord-surface)] hover:shadow-lg hover:shadow-black/20",
        scene.status === "failed" && "border-[var(--nord-danger)]",
      )}
    >
      <div className="h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-[var(--nord-bg)] ring-1 ring-[var(--nord-hairline)]">
        {scene.status === "completed" && scene.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : scene.status === "completed" && scene.preview ? (
          <PointCloudThumbnail preview={scene.preview} height={56} variant="dark-card" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <StatusDot status={scene.status} className="h-2 w-2" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-semibold text-[var(--nord-ink)]">
            {scene.title}
          </h3>
          <SceneVisibilityBadge visibility={visibility} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--nord-slate)]">
          {scene.status !== "completed" && (
            <span className="inline-flex items-center gap-1 uppercase tracking-wide">
              <StatusDot status={scene.status} className="h-1.5 w-1.5" />
              {STATUS_LABELS[scene.status]}
            </span>
          )}
          <span className="font-sw-mono">{scene.caption}</span>
        </div>
        <SceneStatChips
          forksCount={scene.forksCount}
          commentsCount={scene.commentsCount}
          reactionsTotal={scene.reactionsTotal}
          reactionCounts={scene.reactionCounts}
          className="mt-1.5"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {showCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={cancelling}
            onClick={() => onCancelScene?.(scene)}
            className="rounded-lg border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-[var(--nord-ink)] hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]"
          >
            <XCircle data-icon="inline-start" />
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {showSubmit && (
          <Button
            size="sm"
            disabled={submitting}
            onClick={() => onSubmitScene?.(scene)}
            className={cn(
              "rounded-lg border text-[13px] font-medium",
              scene.apiStatus === "FAILED"
                ? "border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-[var(--nord-danger)] hover:bg-[var(--nord-tint)]"
                : "border-transparent bg-[var(--nord-surface-2)] text-[var(--nord-ink)] hover:bg-[var(--nord-surface-2)]",
            )}
          >
            <Send data-icon="inline-start" />
            {submitting ? "Submitting…" : scene.apiStatus === "FAILED" ? "Retry" : "Submit"}
          </Button>
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "rounded-lg p-1.5 text-[var(--nord-slate)] transition-colors hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]",
              menuOpen ? "bg-[var(--nord-tint)] text-[var(--nord-ink)] opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="sw-popover absolute right-0 top-full z-50 mt-2 min-w-[148px] overflow-hidden rounded-xl py-1"
            >
              {scene.status === "completed" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditScene?.(scene);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-tint)]"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Edit
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteScene?.(scene);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-[var(--nord-danger)] transition-colors hover:bg-[var(--nord-tint)]"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
