import { cn } from "@/lib/utils";

type CommentCountBadgeProps = {
  commentsCount?: number;
  className?: string;
  chip?: boolean;
};

export default function CommentCountBadge({
  commentsCount = 0,
  className,
  chip = false,
}: CommentCountBadgeProps) {
  if (commentsCount <= 0) return null;

  return (
    <span
      className={cn(
        chip
          ? "sw-stat-chip"
          : "inline-flex items-center gap-1 font-sw-mono text-[11px] text-[#c0c0c8]",
        className,
      )}
      aria-label={`${commentsCount} comments`}
    >
      <span aria-hidden>💬</span>
      <span>{commentsCount}</span>
    </span>
  );
}
