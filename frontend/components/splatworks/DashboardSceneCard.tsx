"use client";

import { useState } from "react";
import { RefreshCw, Send, Settings2, XCircle } from "lucide-react";

import { ImageOff } from "lucide-react";

import SceneCardMenu from "@/components/splatworks/dashboard/SceneCardMenu";
import SceneCreatorRow from "@/components/splatworks/dashboard/SceneCreatorRow";
import SceneStatChips from "@/components/splatworks/dashboard/SceneStatChips";
import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import StatusDot, { STATUS_LABELS, STATUS_STYLES } from "@/components/splatworks/StatusDot";
import SceneTaxonomyDisplay from "@/components/features/scenes/SceneTaxonomyDisplay";
import { SceneVisibilityBadge } from "@/components/features/scenes/SceneVisibilityControl";
import AdvancedSettingsPanel from "@/components/upload/AdvancedSettingsPanel";
import { Button } from "@/components/ui/button";
import { formatProgressSubPhase } from "@/lib/scenes/progressLabels";
import { isActiveGpuJobStatus } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import type { SubmitJobOptions } from "@/services/jobsService";
import type { ColmapConfig, SceneVisibility, TrainConfig } from "@/types/api";
import type { DashboardScene } from "@/types/splatworks";

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
  /** Tighter card for bento side-stack. */
  density?: "default" | "compact";
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
  density = "default",
}: DashboardSceneCardProps) {
  const styles = STATUS_STYLES[scene.status];
  const visibility = scene.visibility ?? "PRIVATE";
  const isViewable = scene.status === "completed";
  const showSubmit = canSubmitScene(scene);
  const showCancel = isActiveGpuJobStatus(scene.apiStatus);
  const isCompact = density === "compact";

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

  const showProcessingFooter = showCancel || showSubmit;

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
        "sw-glass-card group relative flex flex-col overflow-hidden rounded-xl",
        scene.status === "failed" && "sw-glass-card-failed",
        isViewable && "sw-glass-card-hover cursor-pointer",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden",
          isCompact ? "aspect-[5/4]" : "aspect-[4/3]",
        )}
      >
        {scene.status === "completed" && scene.thumbnailUrl ? (
          <>
            {/* Presigned S3 URLs — not compatible with next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scene.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </>
        ) : scene.status === "completed" && scene.preview ? (
          <PointCloudThumbnail
            preview={scene.preview}
            height={isCompact ? 160 : 200}
            variant="dark-card"
            className="h-full w-full"
          />
        ) : scene.status === "completed" ? (
          // A completed job with neither a thumbnail nor point-cloud preview
          // (e.g. thumbnail generation failed separately from training).
          // Previously this fell through to StatusTile, which has no
          // "completed" branch and rendered an empty tile with no message.
          <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-[var(--nord-tint)] px-4 text-center">
            <ImageOff className="h-5 w-5 text-[var(--nord-slate-soft)]" strokeWidth={1.5} />
            <p className="font-sw-mono text-[10px] text-[var(--nord-slate)]">
              Preview unavailable
            </p>
          </div>
        ) : (
          <StatusTile
            scene={scene}
            tileBg={styles.tile}
            textColor={styles.text}
            pulse={styles.dotPulse}
            compact={isCompact}
          />
        )}

        <SceneVisibilityBadge
          visibility={visibility}
          className="absolute left-2 top-2 border-[var(--nord-hairline)] bg-[var(--nord-scrim)] text-[9px] text-[var(--nord-scrim-fg)] backdrop-blur-sm"
        />

        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {scene.status !== "completed" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] px-1.5 py-0.5 font-sw-mono text-[9px] font-medium uppercase tracking-wide text-[var(--nord-scrim-fg)] backdrop-blur-sm">
              <StatusDot status={scene.status} pulse={styles.dotPulse} className="h-1.5 w-1.5" />
              {scene.apiStatus === "UPLOADED"
                ? "Ready"
                : scene.apiStatus === "PENDING_UPLOAD"
                  ? "Importing"
                  : scene.apiStatus === "CANCELLED"
                    ? "Cancelled"
                    : STATUS_LABELS[scene.status]}
            </span>
          )}
          <SceneCardMenu
            showEdit={scene.status === "completed"}
            visibility={visibility}
            visibilityUpdating={visibilityUpdating}
            onEdit={() => onEditScene?.(scene)}
            onDelete={() => onDeleteScene?.(scene)}
            onVisibilityChange={
              onVisibilityChange
                ? (next) => onVisibilityChange(scene, next)
                : undefined
            }
            buttonClassName="rounded-full border border-[var(--nord-hairline)] bg-[var(--nord-scrim)] text-[var(--nord-scrim-fg)] opacity-90 backdrop-blur-sm hover:bg-[var(--nord-scrim)] hover:text-[var(--nord-scrim-fg)] hover:opacity-100"
          />
        </div>
      </div>

      <div className="sw-card-body flex flex-1 flex-col px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className={cn(
                  "min-w-0 flex-1 truncate font-semibold text-[var(--nord-ink)]",
                  isCompact ? "text-[13px]" : "text-[14px]",
                )}
              >
                {scene.title}
              </h3>
            </div>
            <div className="mt-1">
              <SceneCreatorRow inline />
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="min-w-0 truncate font-sw-mono text-[10px] text-[var(--nord-slate)]">
            {scene.caption}
          </p>
        </div>

        <SceneStatChips
          forksCount={scene.forksCount}
          commentsCount={scene.commentsCount}
          reactionsTotal={scene.reactionsTotal}
          reactionCounts={scene.reactionCounts}
          className="mt-1.5"
        />

        {!isCompact && (
          <SceneTaxonomyDisplay
            category={scene.category}
            tags={scene.tags}
            className="mt-1.5"
          />
        )}

        {showProcessingFooter && (
          <div
            className="mt-2.5 space-y-2 border-t border-[var(--nord-hairline)] pt-2.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {showCancel && (
              <Button
                size="sm"
                variant="outline"
                disabled={cancelling}
                onClick={() => onCancelScene?.(scene)}
                className="h-7 w-full rounded-md border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-xs text-[var(--nord-ink)] hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]"
              >
                <XCircle data-icon="inline-start" />
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            )}
            {showSubmit && (
              <div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    disabled={submitting}
                    onClick={handleSubmitClick}
                    className={cn(
                      "h-7 flex-1 rounded-md border text-xs font-medium",
                      scene.apiStatus === "FAILED"
                        ? "border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-[var(--nord-danger)] hover:bg-[var(--nord-tint)]"
                        : "border-transparent bg-[var(--nord-surface-2)] text-[var(--nord-ink)] hover:bg-[var(--nord-surface-2)]",
                    )}
                  >
                    <Send data-icon="inline-start" />
                    {submitting
                      ? "Submitting…"
                      : scene.apiStatus === "FAILED"
                        ? "Retry"
                        : "Submit"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={showAdvanced}
                    aria-label="Advanced training settings"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className={cn(
                      "h-7 rounded-md border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-[var(--nord-slate)] hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]",
                      showAdvanced && "bg-[var(--nord-tint)] text-[var(--nord-ink)]",
                    )}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
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
  compact,
}: {
  scene: DashboardScene;
  tileBg: string;
  textColor: string;
  pulse?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center px-4 text-center"
      style={{ background: tileBg }}
    >
      {scene.status === "training" && scene.progressPercent != null && (
        <>
          {scene.progressSubPhase && (
            <p className="mb-1.5 max-w-full truncate font-sw-mono text-[9px] uppercase tracking-wide text-[var(--nord-slate)]">
              {formatProgressSubPhase(scene.progressSubPhase)}
            </p>
          )}
          <div
            className={cn(
              "font-sw-mono font-semibold leading-none",
              compact ? "text-xl" : "text-2xl",
            )}
            style={{ color: textColor }}
          >
            {scene.progressPercent}%
          </div>
          <div className="mt-2 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--nord-tint)]">
            <div
              className="h-full rounded-full bg-[var(--nord-tint)]"
              style={{ width: `${scene.progressPercent}%` }}
            />
          </div>
          {scene.eta && (
            <p className="mt-1.5 font-sw-mono text-[10px] text-[var(--nord-slate)]">
              ~{scene.eta} left
            </p>
          )}
        </>
      )}

      {scene.status === "queued" && scene.queuePosition != null && (
        <>
          <div
            className={cn(
              "font-sw-mono font-semibold leading-none",
              compact ? "text-xl" : "text-2xl",
            )}
            style={{ color: textColor }}
          >
            #{scene.queuePosition}
          </div>
          <div className="mt-1 font-sw-mono text-[10px] text-[var(--nord-slate)]">
            in queue · {scene.queueEta}
          </div>
        </>
      )}

      {scene.status === "draft" && scene.uploadedImageCount != null && (
        <>
          <div
            className={cn(
              "font-sw-mono font-semibold leading-none",
              compact ? "text-xl" : "text-2xl",
            )}
            style={{ color: textColor }}
          >
            {scene.uploadedImageCount}
          </div>
          <div className="mt-1 font-sw-mono text-[10px] text-[var(--nord-slate)]">images</div>
        </>
      )}

      {scene.status === "failed" && scene.errorMessage && (
        <div className="max-w-[160px] font-sw-mono text-[10px] leading-snug text-[var(--nord-ink)]">
          {scene.errorMessage}
        </div>
      )}

      {scene.status === "failed" && (
        <div className="mt-1.5 flex items-center gap-1 font-sw-mono text-[10px] text-[var(--nord-slate)]">
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          Retry below
        </div>
      )}
    </div>
  );
}
