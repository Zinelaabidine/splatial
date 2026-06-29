import { cn } from "@/lib/utils";

type CommentCountBadgeProps = {
  commentsCount?: number;
  className?: string;
};

export default function CommentCountBadge({
  commentsCount = 0,
  className,
}: CommentCountBadgeProps) {
  if (commentsCount <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-sw-mono text-[11px] text-[#b0b0b0]",
        className,
      )}
      aria-label={`${commentsCount} comments`}
    >
      <span aria-hidden>💬</span>
      <span>{commentsCount}</span>
    </span>
  );
}
