"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import CommentBody from "@/components/viewer/CommentBody";
import CommentReactionBar from "@/components/viewer/CommentReactionBar";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/time/formatRelativeTime";
import { normalizeReactionSummary } from "@/lib/reactions/constants";
import { cn } from "@/lib/utils";
import {
  createReply,
  deleteComment as deleteCommentRequest,
  listReplies,
  MAX_COMMENT_LENGTH,
} from "@/services/commentsService";
import { ApiRequestError } from "@/lib/api/apiErrors";
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
  /** Required to load/post replies. Omit to render a comment with no reply UI. */
  sceneId?: string;
  /** Needed so fetched replies can compute their own delete permission. */
  currentUserId?: string | null;
  isSceneOwner?: boolean;
};

export default function CommentRow({
  comment,
  canDelete,
  deleting = false,
  onDelete,
  className,
  sceneId,
  currentUserId,
  isSceneOwner = false,
}: CommentRowProps) {
  const handle = comment.authorUsername.trim().toLowerCase();
  const initials = initialsFromDisplayName(
    comment.authorDisplayName || comment.authorUsername,
  );

  // Replies are one level deep — a fetched reply never shows its own
  // reply UI (comment.parentCommentId would be set on it).
  const canHaveReplies = Boolean(sceneId) && !comment.parentCommentId;

  const [replyCount, setReplyCount] = useState(comment.replyCount ?? 0);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<Comment[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);

  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadReplies = useCallback(async () => {
    if (!sceneId || loadingReplies) return;
    setLoadingReplies(true);
    try {
      const res = await listReplies(sceneId, comment.commentId);
      setReplies(res.replies ?? []);
      setRepliesLoaded(true);
    } catch {
      /* leave replies empty; the "View replies" toggle can be retried */
    } finally {
      setLoadingReplies(false);
    }
  }, [sceneId, comment.commentId, loadingReplies]);

  const handleToggleReplies = useCallback(() => {
    const next = !showReplies;
    setShowReplies(next);
    if (next && !repliesLoaded) void loadReplies();
  }, [showReplies, repliesLoaded, loadReplies]);

  const handlePostReply = useCallback(async () => {
    if (!sceneId || postingReply) return;
    const trimmed = replyDraft.trim();
    if (!trimmed) return;

    setPostingReply(true);
    setReplyError(null);
    try {
      const created = await createReply(sceneId, comment.commentId, trimmed);
      setReplies((prev) => [...prev, created]);
      setReplyCount((prev) => prev + 1);
      setRepliesLoaded(true);
      setShowReplies(true);
      setReplyDraft("");
      setShowReplyBox(false);
    } catch (err) {
      setReplyError(
        err instanceof ApiRequestError ? err.message : "Could not post reply.",
      );
    } finally {
      setPostingReply(false);
    }
  }, [sceneId, comment.commentId, replyDraft, postingReply]);

  const handleDeleteReply = useCallback(
    async (replyId: string) => {
      if (!sceneId || deletingReplyId) return;
      setDeletingReplyId(replyId);
      try {
        await deleteCommentRequest(sceneId, replyId);
        setReplies((prev) => prev.filter((r) => r.commentId !== replyId));
        setReplyCount((prev) => Math.max(0, prev - 1));
      } catch {
        /* row stays on failure */
      } finally {
        setDeletingReplyId(null);
      }
    },
    [sceneId, deletingReplyId],
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

        <div className="mt-1.5 flex items-center gap-3">
          <CommentReactionBar
            sceneId={sceneId ?? comment.sceneId}
            commentId={comment.commentId}
            initialSummary={normalizeReactionSummary(comment)}
          />
          {canHaveReplies ? (
            <>
              <button
                type="button"
                onClick={() => setShowReplyBox((v) => !v)}
                className="font-sw-mono text-[11px] text-[#909090] hover:text-white"
              >
                Reply
              </button>
              {replyCount > 0 ? (
                <button
                  type="button"
                  onClick={handleToggleReplies}
                  className="font-sw-mono text-[11px] text-[#909090] hover:text-white"
                >
                  {showReplies
                    ? "Hide replies"
                    : `View ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        {canHaveReplies && showReplyBox ? (
          <div className="mt-2 space-y-1.5">
            <Textarea
              value={replyDraft}
              onChange={(e) =>
                setReplyDraft(e.target.value.slice(0, MAX_COMMENT_LENGTH))
              }
              placeholder={`Reply to @${handle || "unknown"}…`}
              rows={2}
              disabled={postingReply}
              aria-label="Reply text"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={postingReply}
                onClick={() => {
                  setShowReplyBox(false);
                  setReplyDraft("");
                  setReplyError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={postingReply || replyDraft.trim().length === 0}
                onClick={() => void handlePostReply()}
                className="bg-[#19c2ad] text-black hover:bg-[#15a896]"
              >
                {postingReply ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Replying…
                  </>
                ) : (
                  "Reply"
                )}
              </Button>
            </div>
            {replyError ? (
              <p className="text-xs text-red-400" role="alert">
                {replyError}
              </p>
            ) : null}
          </div>
        ) : null}

        {canHaveReplies && showReplies ? (
          <div className="mt-3 space-y-3 border-l border-[#2a2a2a] pl-3">
            {loadingReplies ? (
              <p className="font-sw-mono text-[11px] text-[#707070]">
                Loading replies…
              </p>
            ) : (
              replies.map((reply) => {
                const canDeleteReply =
                  isSceneOwner ||
                  (currentUserId != null && reply.userId === currentUserId);
                return (
                  <CommentRow
                    key={reply.commentId}
                    comment={reply}
                    canDelete={canDeleteReply}
                    deleting={deletingReplyId === reply.commentId}
                    onDelete={(id) => void handleDeleteReply(id)}
                  />
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
