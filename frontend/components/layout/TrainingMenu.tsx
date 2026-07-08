"use client";

import { TrendingUp } from "lucide-react";

import { useDismissablePopover } from "@/hooks/layout/useDismissablePopover";
import {
  useJobStatusSummary,
  type JobStatusJob,
} from "@/hooks/layout/useJobStatusSummary";
import {
  formatEtaSeconds,
  formatProgressPhase,
  formatProgressSubPhase,
} from "@/lib/scenes/progressLabels";
import { formatRelativeTime } from "@/lib/time/formatRelativeTime";
import { cn } from "@/lib/utils";

/** Matches DashboardSceneCard DARK_STATUS badge colours. */
const STATUS_BADGE: Record<string, { label: string; tile: string; text: string }> = {
  FAILED: { label: "Failed", tile: "#2a1515", text: "#f87171" },
  PROCESSING: { label: "Training", tile: "#1a2332", text: "#60a5fa" },
  QUEUED: { label: "Queued", tile: "#262626", text: "#a3a3a3" },
};

function truncateName(name: string | null | undefined, max = 28): string {
  const s = (name ?? "Untitled").trim() || "Untitled";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Compact summary text next to the trigger, e.g. "Queue: 2 processing, 1 failed". */
function summaryText(queued: number, processing: number, failed: number): string | null {
  const parts: string[] = [];
  if (processing > 0) parts.push(`${processing} processing`);
  if (queued > 0) parts.push(`${queued} queued`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (parts.length === 0) return null;
  return `Queue: ${parts.join(", ")}`;
}

// Facebook-style anchored popover — trigger lives in the top bar next to
// comments/notifications/account. Sourced from the caller's own scenes
// (GET /api/v1/scenes) rather than the admin attempts endpoint, so it works
// for every signed-in user, not just admins.
export default function TrainingMenu() {
  const { queuedCount, processingCount, failedCount, jobs } = useJobStatusSummary();
  const { open, setOpen, ref } = useDismissablePopover<HTMLDivElement>();
  const activeCount = queuedCount + processingCount;
  const label = summaryText(queuedCount, processingCount, failedCount);

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-2">
      {label ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "hidden shrink-0 rounded-full px-2.5 py-1 font-sw-mono text-[11px] font-medium transition-colors sm:inline-flex",
            failedCount > 0
              ? "bg-red-950/40 text-red-300 hover:bg-red-950/60"
              : "bg-white/[0.06] text-[#c4c4cc] hover:bg-white/10",
          )}
        >
          {label}
        </button>
      ) : null}

      <button
        type="button"
        aria-label={activeCount > 0 ? `Training, ${activeCount} in progress` : "Training"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          open ? "bg-white/10 text-white" : "text-[#f1f1f1] hover:bg-white/10",
        )}
      >
        <TrendingUp className="h-5 w-5" strokeWidth={open ? 2 : 1.5} />
        {activeCount > 0 || failedCount > 0 ? (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white",
              failedCount > 0 && activeCount === 0 ? "bg-red-500" : "bg-[#d97706]",
            )}
          >
            {(activeCount || failedCount) > 99 ? "99+" : activeCount || failedCount}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          aria-label="Training"
          className="sw-popover absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Training</h3>
            {label ? (
              <span className="font-sw-mono text-[11px] text-[#909090]">{label}</span>
            ) : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-[#808080]">
                No training runs yet.
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {jobs.map((job) => (
                  <JobRow key={job.sceneId} job={job} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: JobStatusJob }) {
  const badge = STATUS_BADGE[job.status] ?? {
    label: job.status,
    tile: "#262626",
    text: "#a3a3a3",
  };
  const pct =
    typeof job.progressPercent === "number"
      ? Math.max(0, Math.min(100, job.progressPercent))
      : null;

  return (
    <li className="px-4 py-3 transition-colors hover:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {truncateName(job.name)}
        </p>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 font-sw-mono text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: badge.tile, color: badge.text }}
        >
          {badge.label}
        </span>
      </div>

      {job.status === "QUEUED" ? (
        <p className="mt-1.5 font-sw-mono text-xs text-[#909090]">
          Queued {formatRelativeTime(job.createdAt)}
        </p>
      ) : null}

      {job.status === "PROCESSING" ? (
        <div className="mt-1.5 space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs text-[#909090]">
            <span className="font-sw-mono tabular-nums">{pct != null ? `${pct}%` : "—"}</span>
            <span className="font-sw-mono">
              {job.progressEtaSeconds != null
                ? `~${formatEtaSeconds(job.progressEtaSeconds)} remaining`
                : "Estimating…"}
            </span>
          </div>
          <p className="font-sw-mono text-[11px] text-[#707070]">
            {formatProgressSubPhase(job.progressSubPhase) ??
              formatProgressPhase(job.progressPhase) ??
              "Processing"}
            {" · started "}
            {formatRelativeTime(job.createdAt)}
          </p>
        </div>
      ) : null}

      {job.status === "FAILED" ? (
        <div className="mt-1.5 space-y-0.5">
          <p className="font-sw-mono text-xs text-red-400">
            Failed {formatRelativeTime(job.updatedAt)}
          </p>
          {job.errorMessage || job.failureReason ? (
            <p className="truncate text-[11px] text-[#909090]" title={job.errorMessage ?? job.failureReason}>
              {job.errorMessage ?? job.failureReason}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
