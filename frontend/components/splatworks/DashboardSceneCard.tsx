"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, RefreshCw, Send, Settings2, Trash2, XCircle } from "lucide-react";

import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import CommentCountBadge from "@/components/splatworks/CommentCountBadge";
import ForkCountBadge from "@/components/splatworks/ForkCountBadge";
import ReactionTotalBadge from "@/components/splatworks/ReactionTotalBadge";
import StatusDot, { STATUS_LABELS } from "@/components/splatworks/StatusDot";
import SceneTaxonomyDisplay from "@/components/features/scenes/SceneTaxonomyDisplay";
import { SceneVisibilityBadge, SceneVisibilityToggle } from "@/components/features/scenes/SceneVisibilityControl";
import AdvancedSettingsPanel from "@/components/upload/AdvancedSettingsPanel";
import { Button } from "@/components/ui/button";
import { formatProgressSubPhase } from "@/lib/scenes/progressLabels";
import { isActiveGpuJobStatus } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import type { SubmitJobOptions } from "@/services/jobsService";
import type { ColmapConfig, SceneVisibility, TrainConfig } from "@/types/api";
import type { DashboardScene, SceneStatus } from "@/types/splatworks";

// One flat graphite tile for every non-viewable status — the small status
// dot and label carry the meaning, not a colored background wash.
const DARK_STATUS: Record<
  SceneStatus,
  { tile: string; text: string; pulse?: boolean }
> = {
  draft: {
    tile: "#141416",
    text: "#a1a1aa",
  },
  queued: {
    tile: "#141416",
    text: "#d4a24c",
  },
  training: {
    tile: "#141416",
    text: "#e4e4e7",
    pulse: true,
  },
  completed: {
    tile: "#141416",
    text: "#8fd6ab",
  },
  failed: {
    tile: "#141416",
    text: "#e0918f",
  },
};

type DashboardSceneCardProps = {
  scene: DashboardScene;
  onClick: (scene: DashboardScene) => void;
  onSubmitScene?: (scene: DashboardScene, options?: SubmitJobOptions) => void;
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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [trainConfig, setTrainConfig] = useState<TrainConfig>({});
  const [colmapConfig, setColmapConfig] = useState<ColmapConfig>({});
  const hasOverrides =
    Object.values(trainConfig).some((v) => v !== undefined) ||
    Object.values(colmapConfig).some((v) => v !== undefined);

  const handleSubmitClick = () => {
    onSubmitScene?.(
      scene,
      hasOverrides ? { trainConfig, colmapConfig } : undefined,
    );
  };

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
        "sw-glass-card group relative rounded-2xl",
        scene.status === "failed" && "sw-glass-card-failed",
        isViewable && "sw-glass-card-hover cursor-pointer",
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
          className="h-[200px] w-full rounded-t-2xl object-cover"
        />
        </>
      ) : scene.status === "completed" && scene.preview ? (
        <PointCloudThumbnail
          preview={scene.preview}
          height={200}
          variant="dark-card"
          className="rounded-t-2xl"
        />
      ) : (
        <StatusTile
          scene={scene}
          tileBg={styles.tile}
          textColor={styles.text}
          pulse={styles.pulse}
        />
      )}

      <div className="rounded-b-2xl px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white">
            {scene.title}
          </h3>
          <SceneVisibilityBadge visibility={visibility} />
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
                "rounded-md p-1 text-[#9a9aa2] transition-colors hover:bg-white/10 hover:text-white",
                menuOpen ? "bg-white/10 text-white opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="sw-glass absolute bottom-full right-0 z-50 mb-2 min-w-[140px] overflow-hidden rounded-lg py-1"
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
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-[#e4e4e7] transition-colors hover:bg-white/10"
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
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-[#e0918f] transition-colors hover:bg-white/10"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-[#84848c]">
          <span>{scene.caption}</span>
          {(scene.forksCount != null && scene.forksCount > 0) ||
          (scene.commentsCount != null && scene.commentsCount > 0) ||
          (scene.reactionsTotal != null && scene.reactionsTotal > 0) ? (
            <span className="flex items-center gap-2">
              <span className="text-[#4a4a52]">·</span>
              <ForkCountBadge forksCount={scene.forksCount} />
              <CommentCountBadge commentsCount={scene.commentsCount} />
              <ReactionTotalBadge
                reactionsTotal={scene.reactionsTotal}
                reactionCounts={scene.reactionCounts}
              />
            </span>
          ) : null}
        </div>
        <SceneTaxonomyDisplay
          category={scene.category}
          tags={scene.tags}
          className="mt-1.5"
        />
        <div
          className="mt-2.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <SceneVisibilityToggle
            compact
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
            className="mt-2.5 w-full rounded-md border-white/12 bg-white/[0.04] text-[#e4e4e7] hover:bg-white/10 hover:text-white"
          >
            <XCircle data-icon="inline-start" />
            {cancelling ? "Cancelling…" : "Cancel processing"}
          </Button>
        )}
        {showSubmit && (
          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={submitting}
                onClick={handleSubmitClick}
                className={cn(
                  "flex-1 rounded-md border text-[13px] font-medium",
                  scene.apiStatus === "FAILED"
                    ? "border-white/12 bg-white/[0.04] text-[#e0918f] hover:bg-white/10"
                    : "border-transparent bg-[#f4f4f5] text-[#0a0a0b] hover:bg-[#e4e4e7]",
                )}
              >
                <Send data-icon="inline-start" />
                {submitting
                  ? "Submitting…"
                  : scene.apiStatus === "FAILED"
                    ? "Retry training"
                    : "Submit for processing"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-expanded={showAdvanced}
                aria-label="Advanced training settings"
                onClick={() => setShowAdvanced((v) => !v)}
                className={cn(
                  "rounded-md border-white/12 bg-white/[0.04] text-[#9a9aa2] hover:bg-white/10 hover:text-white",
                  showAdvanced && "bg-white/10 text-white",
                )}
              >
                <Settings2 />
              </Button>
            </div>
            {showAdvanced && (
              <div className="sw-glass mt-2 rounded-lg p-2">
                <AdvancedSettingsPanel
                  trainConfig={trainConfig}
                  colmapConfig={colmapConfig}
                  onTrainConfigChange={setTrainConfig}
                  onColmapConfigChange={setColmapConfig}
                />
              </div>
            )}
          </div>
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
      className="flex h-[200px] flex-col items-center justify-center rounded-t-2xl px-5 text-center"
      style={{ background: tileBg }}
    >
      <span
        className="inline-flex items-center gap-1.5 font-sw-mono text-[10px] font-medium uppercase tracking-wider text-[#84848c]"
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
            <p className="mb-2 max-w-full truncate font-sw-mono text-[10px] uppercase tracking-wide text-[#84848c]">
              {formatProgressSubPhase(scene.progressSubPhase)}
            </p>
          )}
          <div
            className="my-2.5 font-sw-mono text-xl font-semibold leading-none"
            style={{ color: textColor }}
          >
            {scene.progressPercent}%
          </div>
          <div className="h-[3px] w-full max-w-[140px] overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/70"
              style={{ width: `${scene.progressPercent}%` }}
            />
          </div>
          {scene.eta && (
            <p className="mt-2 font-sw-mono text-[11px] text-[#84848c]">
              ~{scene.eta} remaining
            </p>
          )}
          {scene.workerVersion && (
            <p className="mt-1 font-sw-mono text-[10px] uppercase tracking-wide text-[#5a5a62]">
              Worker v{scene.workerVersion}
            </p>
          )}
        </>
      )}

      {scene.status === "queued" && scene.queuePosition != null && (
        <>
          <div
            className="mb-1 mt-2.5 font-sw-mono text-xl font-semibold leading-none"
            style={{ color: textColor }}
          >
            #{scene.queuePosition}
          </div>
          <div className="font-sw-mono text-[11px] text-[#84848c]">
            in queue · {scene.queueEta}
          </div>
        </>
      )}

      {scene.status === "draft" && scene.uploadedImageCount != null && (
        <>
          <div
            className="mb-1 mt-2.5 font-sw-mono text-xl font-semibold leading-none"
            style={{ color: textColor }}
          >
            {scene.uploadedImageCount}
          </div>
          <div className="font-sw-mono text-[11px] text-[#84848c]">images uploaded</div>
        </>
      )}

      {scene.status === "failed" && scene.errorMessage && (
        <>
          <div className="my-2.5 max-w-[180px] font-sw-mono text-[11px] leading-snug text-[#a1a1aa]">
            {scene.errorMessage}
          </div>
          {scene.failedAtIter && (
            <div className="font-sw-mono text-[11px] text-[#84848c]">
              at iter {scene.failedAtIter}
            </div>
          )}
        </>
      )}

      {scene.status === "failed" && (
        <div className="mt-2.5 flex items-center gap-1.5 font-sw-mono text-[11px] text-[#84848c]">
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          Click Retry below to resubmit
        </div>
      )}
    </div>
  );
}
