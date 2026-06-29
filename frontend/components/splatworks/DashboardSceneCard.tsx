"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, RefreshCw, Send, Trash2, XCircle } from "lucide-react";

import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import StatusDot, { STATUS_LABELS } from "@/components/splatworks/StatusDot";
import { SceneVisibilityBadge, SceneVisibilityToggle } from "@/components/features/scenes/SceneVisibilityControl";
import { Button } from "@/components/ui/button";
import { formatProgressSubPhase } from "@/lib/scenes/progressLabels";
import { isActiveGpuJobStatus } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import type { SceneVisibility } from "@/types/api";
import type { DashboardScene, SceneStatus } from "@/types/splatworks";

const DARK_STATUS: Record<
  SceneStatus,
  { tile: string; text: string; pulse?: boolean }
> = {
  draft: { tile: "#262626", text: "#a3a3a3" },
  queued: { tile: "#2a2218", text: "#fbbf24" },
  training: { tile: "#1a2332", text: "#60a5fa", pulse: true },
  completed: { tile: "#0a0a0a", text: "#4ade80" },
  failed: { tile: "#2a1515", text: "#f87171" },
};

type DashboardSceneCardProps = {
  scene: DashboardScene;
  onClick: (scene: DashboardScene) => void;
  onSubmitScene?: (scene: DashboardScene) => void;
  onCancelScene?: (scene: DashboardScene) => void;
  onDeleteScene?: (scene: DashboardScene) => void;
  onEditScene?: (scene: DashboardScene) => void;
  onVisibilityChange?: (scene: DashboardScene, visibility: SceneVisibility) => void;
  submitting?: boolean;
  cancelling?: boolean;
  visibilityUpdating?: boolean;
};

function canSubmitScene(scene: DashboardScene): boolean {
  return (
    scene.apiStatus === "UPLOADED" ||
    scene.apiStatus === "FAILED" ||
    scene.apiStatus === "CANCELLED"
  );
}

export default function DashboardSceneCard({
  scene,
  onClick,
  onSubmitScene,
  onCancelScene,
  onDeleteScene,
  onEditScene,
  onVisibilityChange,
  submitting = false,
  cancelling = false,
  visibilityUpdating = false,
}: DashboardSceneCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const styles = DARK_STATUS[scene.status];
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
        "group relative rounded-xl bg-[#212121] transition-all duration-200",
        isViewable
          ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40"
          : "hover:bg-[#242424]",
        menuOpen && "z-50",
      )}
    >
      {scene.status === "completed" && scene.thumbnailUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
          src={scene.thumbnailUrl}
          alt=""
          className="h-[180px] w-full rounded-t-xl object-cover"
        />
        </>
      ) : scene.status === "completed" && scene.preview ? (
        <PointCloudThumbnail
          preview={scene.preview}
          height={180}
          variant="dark-card"
          className="rounded-t-xl"
        />
      ) : (
        <StatusTile
          scene={scene}
          tileBg={styles.tile}
          textColor={styles.text}
          pulse={styles.pulse}
        />
      )}

      <div className="rounded-b-xl p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                {scene.title}
              </h3>
              <SceneVisibilityBadge visibility={visibility} />
            </div>
          </div>
          <div
            ref={menuRef}
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((open) => !open);
              }}
              className={cn(
                "rounded-full p-1.5 text-[#b3b3b3] transition-colors hover:bg-[#303030] hover:text-white",
                menuOpen ? "bg-[#303030] text-white opacity-100" : "opacity-70 group-hover:opacity-100",
              )}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute bottom-full right-0 z-50 mb-2 min-w-[140px] overflow-hidden rounded-lg border border-[#404040] bg-[#1a1a1a] py-1.5 shadow-2xl ring-1 ring-black/50"
                onClick={(e) => e.stopPropagation()}
              >
                {scene.status === "completed" && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onEditScene?.(scene);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#f0f0f0] transition-colors hover:bg-[#2a2a2a]"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDeleteScene?.(scene);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#f87171] transition-colors hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 font-sw-mono text-xs text-[#909090]">{scene.caption}</p>
        <div
          className="mt-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <SceneVisibilityToggle
            visibility={visibility}
            disabled={visibilityUpdating}
            onToggle={(nextVisibility) => onVisibilityChange?.(scene, nextVisibility)}
          />
        </div>
        {showCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={cancelling}
            onClick={(e) => {
              e.stopPropagation();
              onCancelScene?.(scene);
            }}
            className="mt-3 w-full border-amber-700/50 bg-transparent text-amber-400 hover:bg-amber-950/40 hover:text-amber-300"
          >
            <XCircle data-icon="inline-start" />
            {cancelling ? "Cancelling…" : "Cancel processing"}
          </Button>
        )}
        {showSubmit && (
          <Button
            size="sm"
            disabled={submitting}
            onClick={(e) => {
              e.stopPropagation();
              onSubmitScene?.(scene);
            }}
            className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Send data-icon="inline-start" />
            {submitting
              ? "Submitting…"
              : scene.apiStatus === "FAILED"
                ? "Retry training"
                : "Submit for processing"}
          </Button>
        )}
      </div>
    </article>
  );
}

function StatusTile({
  scene,
  tileBg,
  textColor,
  pulse,
}: {
  scene: DashboardScene;
  tileBg: string;
  textColor: string;
  pulse?: boolean;
}) {
  return (
    <div
      className="flex h-[180px] flex-col items-center justify-center rounded-t-xl px-5 text-center"
      style={{ backgroundColor: tileBg }}
    >
      <span
        className="inline-flex items-center gap-1.5 font-sw-mono text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: textColor }}
      >
        <StatusDot status={scene.status} pulse={pulse} className="h-1.5 w-1.5" />
        {scene.apiStatus === "UPLOADED"
          ? "Ready to submit"
          : scene.apiStatus === "PENDING_UPLOAD"
            ? "Importing"
            : scene.apiStatus === "CANCELLED"
              ? "Cancelled"
              : STATUS_LABELS[scene.status]}
      </span>

      {scene.status === "training" && scene.progressPercent != null && (
        <>
          {scene.progressSubPhase && (
            <p
              className="mb-2 max-w-full truncate font-sw-mono text-[10px] uppercase tracking-wide opacity-80"
              style={{ color: textColor }}
            >
              {formatProgressSubPhase(scene.progressSubPhase)}
            </p>
          )}
          <div
            className="my-3 font-sw-mono text-2xl font-semibold leading-none"
            style={{ color: textColor }}
          >
            {scene.progressPercent}%
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#1e3a5f]">
            <div
              className="h-full rounded-full bg-[#3b82f6]"
              style={{ width: `${scene.progressPercent}%` }}
            />
          </div>
          {scene.eta && (
            <p
              className="mt-2 font-sw-mono text-[11px] opacity-90"
              style={{ color: textColor }}
            >
              ~{scene.eta} remaining
            </p>
          )}
        </>
      )}

      {scene.status === "queued" && scene.queuePosition != null && (
        <>
          <div
            className="mb-1 mt-3 font-sw-mono text-2xl font-semibold leading-none"
            style={{ color: textColor }}
          >
            #{scene.queuePosition}
          </div>
          <div className="font-sw-mono text-[11px] text-[#d97706]">
            in queue · {scene.queueEta}
          </div>
        </>
      )}

      {scene.status === "draft" && scene.uploadedImageCount != null && (
        <>
          <div
            className="mb-1 mt-3 font-sw-mono text-2xl font-semibold leading-none"
            style={{ color: textColor }}
          >
            {scene.uploadedImageCount}
          </div>
          <div className="font-sw-mono text-[11px] text-[#737373]">images uploaded</div>
        </>
      )}

      {scene.status === "failed" && scene.errorMessage && (
        <>
          <div
            className="my-3 max-w-[180px] font-sw-mono text-[11px] leading-snug opacity-90"
            style={{ color: textColor }}
          >
            {scene.errorMessage}
          </div>
          {scene.failedAtIter && (
            <div className="font-sw-mono text-[11px] text-[#b91c1c]/80">
              at iter {scene.failedAtIter}
            </div>
          )}
        </>
      )}

      {scene.status === "failed" && (
        <div className="mt-3 flex items-center gap-1.5 font-sw-mono text-[11px] text-[#f87171]/70">
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          Click Retry below to resubmit
        </div>
      )}
    </div>
  );
}
