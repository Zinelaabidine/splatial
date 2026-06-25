"use client";

import { Send } from "lucide-react";

import PointCloudThumbnail from "@/components/splatworks/PointCloudThumbnail";
import StatusDot, { STATUS_LABELS } from "@/components/splatworks/StatusDot";
import { Button } from "@/components/ui/button";
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
  submitting?: boolean;
};

function canSubmitScene(scene: DashboardScene): boolean {
  return scene.apiStatus === "UPLOADED" || scene.apiStatus === "FAILED";
}

export default function DashboardSceneCard({
  scene,
  onClick,
  onSubmitScene,
  submitting = false,
}: DashboardSceneCardProps) {
  const styles = DARK_STATUS[scene.status];
  const isViewable = scene.status === "completed";
  const showSubmit = canSubmitScene(scene);

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
      className={`overflow-hidden rounded-xl bg-[#212121] transition-transform duration-200 ${
        isViewable ? "cursor-pointer hover:-translate-y-1" : ""
      }`}
    >
      {scene.status === "completed" && scene.preview ? (
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

      <div className="p-3">
        <h3 className="truncate text-[15px] font-semibold text-white">{scene.title}</h3>
        <p className="mt-1 font-sw-mono text-xs text-[#909090]">{scene.caption}</p>
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
                ? "Retry"
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
            : STATUS_LABELS[scene.status]}
      </span>

      {scene.status === "training" && scene.progressPercent != null && (
        <>
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
            className="my-3 font-sw-mono text-xs leading-snug"
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
    </div>
  );
}
