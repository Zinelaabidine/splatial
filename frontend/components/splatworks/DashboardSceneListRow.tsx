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
        "group flex items-center gap-4 rounded-xl border border-white/8 bg-[#131316] px-3 py-3 transition-all",
        isViewable && "cursor-pointer hover:border-white/18 hover:bg-[#1a1a1e] hover:shadow-lg hover:shadow-black/20",
        scene.status === "failed" && "border-red-400/40",
      )}
    >
      <div className="h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-[#0e0e10] ring-1 ring-white/6">
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
          <h3 className="min-w-0 truncate text-[14px] font-semibold text-white">
            {scene.title}
          </h3>
          <SceneVisibilityBadge visibility={visibility} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#a8a8b2]">
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
            className="rounded-lg border-white/12 bg-white/[0.04] text-[#e8e8ec] hover:bg-white/10 hover:text-white"
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
                ? "border-white/12 bg-white/[0.04] text-[#e0918f] hover:bg-white/10"
                : "border-transparent bg-[#f4f4f5] text-[#0c0c0e] hover:bg-[#e4e4e7]",
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
              "rounded-lg p-1.5 text-[#a8a8b2] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
              menuOpen ? "bg-white/10 text-white opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
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
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-[#e8e8ec] transition-colors hover:bg-white/10"
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
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-[#e0918f] transition-colors hover:bg-white/10"
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
