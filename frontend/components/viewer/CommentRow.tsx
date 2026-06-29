"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";

import CommentBody from "@/components/viewer/CommentBody";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/time/formatRelativeTime";
import { cn } from "@/lib/utils";
import type { Comment } from "@/types/api";

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

type CommentRowProps = {
  comment: Comment;
  canDelete: boolean;
  deleting?: boolean;
  onDelete?: (commentId: string) => void;
  className?: string;
};

export default function CommentRow({
  comment,
  canDelete,
  deleting = false,
  onDelete,
  className,
}: CommentRowProps) {
  const handle = comment.authorUsername.trim().toLowerCase();
  const initials = initialsFromDisplayName(
    comment.authorDisplayName || comment.authorUsername,
  );

  return (
    <article className={cn("flex gap-3", className)}>
      {comment.authorAvatarUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={comment.authorAvatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        </>
      ) : (
        <UserAvatar initials={initials} size={32} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {handle ? (
              <Link
                href={`/u/${encodeURIComponent(handle)}`}
                className="font-sw-mono text-xs font-medium text-[#19c2ad] hover:underline"
              >
                @{handle}
              </Link>
            ) : (
              <span className="font-sw-mono text-xs font-medium text-[#909090]">
                Unknown
              </span>
            )}
            <time
              dateTime={comment.createdAt}
              className="ml-2 font-sw-mono text-[10px] text-[#737373]"
              title={comment.createdAt}
            >
              {formatRelativeTime(comment.createdAt)}
            </time>
          </div>

          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={deleting}
              aria-label="Delete comment"
              onClick={() => onDelete?.(comment.commentId)}
              className="shrink-0 text-[#737373] hover:bg-[#2a2a2a] hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <CommentBody
          body={comment.body}
          mentions={comment.mentions}
          className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#e8e8e8]"
        />
      </div>
    </article>
  );
}
