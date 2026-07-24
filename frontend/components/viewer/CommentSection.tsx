"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import CommentRow from "@/components/viewer/CommentRow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  createComment,
  deleteComment,
  listComments,
  MAX_COMMENT_LENGTH,
} from "@/services/commentsService";
import { getMyProfile } from "@/services/profileService";
import type { Comment } from "@/types/api";
import { cn } from "@/lib/utils";

type CommentSectionProps = {
  sceneId: string;
  initialCommentsCount?: number;
  isSceneOwner?: boolean;
  onCommentsCountChange?: (count: number) => void;
  variant?: "default" | "overlay";
  onClose?: () => void;
};

function CommentListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--nord-surface)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-[var(--nord-surface)]" />
            <div className="h-3 w-full rounded bg-[var(--nord-surface)]" />
            <div className="h-3 w-4/5 rounded bg-[var(--nord-surface)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CommentSection({
  sceneId,
  initialCommentsCount = 0,
  isSceneOwner = false,
  onCommentsCountChange,
  variant = "default",
  onClose,
}: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [commentsCount, setCommentsCount] = useState(initialCommentsCount);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const profileRef = useRef<{
    userId: string;
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    void getMyProfile(ctrl.signal)
      .then((profile) => {
        if (cancelled) return;
        profileRef.current = {
          userId: profile.userId,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        };
        setCurrentUserId(profile.userId);
      })
      .catch(() => {
        /* profile optional for read-only viewing */
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const updateCount = useCallback(
    (count: number) => {
      setCommentsCount(count);
      onCommentsCountChange?.(count);
    },
    [onCommentsCountChange],
  );

  const fetchComments = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      setLoadMoreError(null);
      setComments([]);
      setNextCursor(undefined);

      try {
        const res = await listComments(sceneId, undefined, signal);
        if (signal.aborted) return;
        setComments(res.comments ?? []);
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load comments";
        setLoadError(message);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [sceneId],
  );

  useEffect(() => {
    if (!sceneId) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchComments(ctrl.signal);
    return () => ctrl.abort();
  }, [sceneId, fetchComments]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const res = await listComments(sceneId, nextCursor);
      setComments((prev) => [...prev, ...(res.comments ?? [])]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load more comments";
      setLoadMoreError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [sceneId, nextCursor, loadingMore]);

  const handlePost = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || posting) return;

    const profile = profileRef.current;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticComment: Comment = {
      commentId: optimisticId,
      sceneId,
      userId: profile?.userId ?? "",
      authorUsername: profile?.username ?? "",
      authorDisplayName: profile?.displayName ?? "",
      authorAvatarUrl: profile?.avatarUrl,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };

    const previousComments = comments;
    const previousCount = commentsCount;

    setComments((prev) => [optimisticComment, ...prev]);
    updateCount(commentsCount + 1);
    setDraft("");
    setPosting(true);
    setPostError(null);

    try {
      const created = await createComment(sceneId, trimmed);
      setComments((prev) =>
        prev.map((c) => (c.commentId === optimisticId ? created : c)),
      );
    } catch (err) {
      setComments(previousComments);
      updateCount(previousCount);
      setDraft(trimmed);
      if (err instanceof ApiRequestError) {
        setPostError(err.message);
      } else if (err instanceof Error) {
        setPostError(err.message);
      } else {
        setPostError("Could not post comment.");
      }
    } finally {
      setPosting(false);
    }
  }, [comments, commentsCount, draft, posting, sceneId, updateCount]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      if (deletingId) return;

      const target = comments.find((c) => c.commentId === commentId);
      const replyCount = target?.replyCount ?? 0;
      if (replyCount > 0) {
        const confirmed = window.confirm(
          `Delete this comment and ${replyCount} ${replyCount === 1 ? "reply" : "replies"}?`,
        );
        if (!confirmed) return;
      }

      const previousComments = comments;
      const previousCount = commentsCount;
      const removedCount = 1 + replyCount;

      setComments((prev) => prev.filter((c) => c.commentId !== commentId));
      updateCount(Math.max(0, commentsCount - removedCount));
      setDeletingId(commentId);
      setPostError(null);

      try {
        const res = await deleteComment(sceneId, commentId);
        updateCount(res.commentsCount);
      } catch (err) {
        setComments(previousComments);
        updateCount(previousCount);
        if (err instanceof ApiRequestError) {
          setPostError(err.message);
        } else if (err instanceof Error) {
          setPostError(err.message);
        } else {
          setPostError("Could not delete comment.");
        }
      } finally {
        setDeletingId(null);
      }
    },
    [comments, commentsCount, deletingId, sceneId, updateCount],
  );

  const trimmedDraft = draft.trim();
  const charCount = draft.length;
  const atLimit = charCount >= MAX_COMMENT_LENGTH;
  const canPost = trimmedDraft.length > 0 && !posting;

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col",
        variant === "overlay" ? "bg-transparent" : "bg-[var(--nord-bg)]",
      )}
      aria-label="Comments"
    >
      <header
        className={cn(
          "shrink-0 border-b px-4 py-3",
          variant === "overlay"
            ? "border-[var(--nord-hairline)] bg-[var(--nord-scrim)] backdrop-blur-md"
            : "border-[var(--nord-hairline)]",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--nord-ink)]">
            Comments
            {commentsCount > 0 ? (
              <span className="ml-2 font-sw-mono text-xs font-normal text-[var(--nord-ink)]">
                {commentsCount}
              </span>
            ) : null}
          </h2>
          {variant === "overlay" && onClose ? (
            <button
              type="button"
              data-overlay-focus
              aria-label="Close comments"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4",
          variant === "overlay" && "text-[var(--nord-ink)]",
        )}
      >
        {loading ? (
          <CommentListSkeleton />
        ) : loadError ? (
          <div className="rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-4 py-3 text-center">
            <p className="text-sm text-[var(--nord-danger)]">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-[var(--nord-hairline)] bg-transparent text-[var(--nord-ink)] hover:bg-[var(--nord-surface)]"
              onClick={() => {
                const ctrl = new AbortController();
                void fetchComments(ctrl.signal);
              }}
            >
              Retry
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm text-[var(--nord-ink)]">No comments yet</p>
            <p className="text-xs text-[var(--nord-slate)]">
              Be the first to say something about this scene.
            </p>
          </div>
        ) : (
          <ul className="space-y-5">
            {comments.map((comment) => {
              const isAuthor =
                currentUserId != null && comment.userId === currentUserId;
              const canDelete = isAuthor || isSceneOwner;

              return (
                <li key={comment.commentId}>
                  <CommentRow
                    comment={comment}
                    canDelete={canDelete}
                    deleting={deletingId === comment.commentId}
                    onDelete={(id) => void handleDelete(id)}
                    sceneId={sceneId}
                    currentUserId={currentUserId}
                    isSceneOwner={isSceneOwner}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor ? (
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
              className="border-[var(--nord-hairline)] bg-transparent text-[var(--nord-ink)] hover:bg-[var(--nord-surface)]"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="animate-spin" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </Button>
            {loadMoreError ? (
              <p className="text-xs text-[var(--nord-danger)]" role="alert">
                {loadMoreError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "shrink-0 space-y-2 border-t px-4 py-3",
          variant === "overlay"
            ? "border-[var(--nord-hairline)] bg-[var(--nord-scrim)] backdrop-blur-md"
            : "border-[var(--nord-hairline)]",
        )}
      >
        <Textarea
          value={draft}
          onChange={(e) => {
            const next = e.target.value.slice(0, MAX_COMMENT_LENGTH);
            setDraft(next);
            setPostError(null);
          }}
          placeholder="Add a comment…"
          rows={2}
          disabled={posting}
          aria-label="Comment text"
        />
        <div className="flex items-center justify-between gap-3">
          <span
            className={
              atLimit
                ? "font-sw-mono text-xs text-amber-400"
                : variant === "overlay"
                  ? "font-sw-mono text-xs text-[var(--nord-slate)]"
                  : "font-sw-mono text-xs text-[var(--nord-slate)]"
            }
          >
            {charCount}/{MAX_COMMENT_LENGTH}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!canPost}
            onClick={() => void handlePost()}
            className="bg-[var(--nord-pine)] text-[var(--nord-ink)] hover:bg-[var(--nord-pine)]"
          >
            {posting ? (
              <>
                <Loader2 className="animate-spin" />
                Posting…
              </>
            ) : (
              "Post"
            )}
          </Button>
        </div>
        {postError ? (
          <p className="text-xs text-[var(--nord-danger)]" role="alert">
            {postError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
