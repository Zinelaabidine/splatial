import { cn } from "@/lib/utils";
import type { SceneStatus } from "@/types/splatworks";

type StatusDotProps = {
  status: SceneStatus | "completed-badge";
  pulse?: boolean;
  className?: string;
};

const DOT_COLORS: Record<StatusDotProps["status"], string> = {
  draft: "#8a8a92",
  queued: "#d4a24c",
  training: "#9a9aa2",
  completed: "#8fd6ab",
  failed: "#e0918f",
  "completed-badge": "#8fd6ab",
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

export const STATUS_LABELS: Record<SceneStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  training: "Training",
  completed: "Completed",
  failed: "Failed",
};

export const STATUS_STYLES: Record<
  SceneStatus,
  { text: string; tile: string; dotPulse?: boolean }
> = {
  draft: { text: "#6b6b66", tile: "#f4f4f1" },
  queued: { text: "#b45309", tile: "#fbf6ee" },
  training: { text: "#1d4ed8", tile: "#eef3fb", dotPulse: true },
  completed: { text: "#15803d", tile: "#0a0e13" },
  failed: { text: "#b91c1c", tile: "#faeeee" },
};
