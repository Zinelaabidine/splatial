import { cn } from "@/lib/utils";
import type { SceneStatus } from "@/types/splatial";

type StatusDotProps = {
  status: SceneStatus | "completed-badge";
  pulse?: boolean;
  className?: string;
};

export const STATUS_LABELS: Record<SceneStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  training: "Training",
  completed: "Completed",
  failed: "Failed",
};

/**
 * Single source of truth for scene status color/label styling.
 *
 * Previously this lived in five uncoordinated places (this file's own dot
 * colors vs. its own STATUS_STYLES export, DashboardSceneCard's DARK_STATUS,
 * the orphaned components/scenes/ScenesDashboard.tsx, and separate ad hoc
 * maps in the admin views) — each with different hues for the same status,
 * so "failed" could render three different reds depending on which screen
 * you were on. Every status-colored surface (card tile, status dot, status
 * badge, filter dropdown) should read from STATUS_STYLES so they can never
 * drift apart again.
 */
export const STATUS_STYLES: Record<
  SceneStatus,
  { text: string; tile: string; dot: string; dotPulse?: boolean }
> = {
  draft: { text: "#6b6b66", tile: "#f4f4f1", dot: "#8a8a86" },
  queued: { text: "#b45309", tile: "#fbf6ee", dot: "#d4a24c" },
  training: { text: "#1d4ed8", tile: "#eef3fb", dot: "#3b6ea5", dotPulse: true },
  completed: { text: "#15803d", tile: "#eaf5ee", dot: "#3f7d63" },
  failed: { text: "#b91c1c", tile: "#faeeee", dot: "#b3564d" },
};

const DOT_COLORS: Record<StatusDotProps["status"], string> = {
  draft: STATUS_STYLES.draft.dot,
  queued: STATUS_STYLES.queued.dot,
  training: STATUS_STYLES.training.dot,
  completed: STATUS_STYLES.completed.dot,
  failed: STATUS_STYLES.failed.dot,
  "completed-badge": STATUS_STYLES.completed.dot,
};

export default function StatusDot({ status, pulse = false, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        pulse && "sw-status-pulse",
        className,
      )}
      style={{ backgroundColor: DOT_COLORS[status] }}
      aria-hidden
    />
  );
}
