import { cn } from "@/lib/utils";

type ForkCountBadgeProps = {
  forksCount?: number;
  className?: string;
};

export default function ForkCountBadge({
  forksCount = 0,
  className,
}: ForkCountBadgeProps) {
  if (forksCount <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-sw-mono text-[11px] text-[#b0b0b0]",
        className,
      )}
      aria-label={`${forksCount} remixes`}
    >
      <span aria-hidden>⑂</span>
      <span>{forksCount}</span>
    </span>
  );
}
