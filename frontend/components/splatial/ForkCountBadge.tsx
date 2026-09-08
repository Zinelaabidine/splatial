import { cn } from "@/lib/utils";

type ForkCountBadgeProps = {
  forksCount?: number;
  className?: string;
  chip?: boolean;
};

export default function ForkCountBadge({
  forksCount = 0,
  className,
  chip = false,
}: ForkCountBadgeProps) {
  if (forksCount <= 0) return null;

  return (
    <span
      className={cn(
        chip
          ? "sw-stat-chip"
          : "inline-flex items-center gap-1 font-sw-mono text-[11px] text-[var(--nord-ink)]",
        className,
      )}
      aria-label={`${forksCount} remixes`}
    >
      <span aria-hidden>⑂</span>
      <span>{forksCount}</span>
    </span>
  );
}
