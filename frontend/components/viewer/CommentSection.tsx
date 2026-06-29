"use client";

import { Loader2 } from "lucide-react";
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

type CommentSectionProps = {
  sceneId: string;
  initialCommentsCount?: number;
  isSceneOwner?: boolean;
  onCommentsCountChange?: (count: number) => void;
};

function CommentListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-[#2a2a2a]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-[#2a2a2a]" />
            <div className="h-3 w-full rounded bg-[#252525]" />
            <div className="h-3 w-4/5 rounded bg-[#252525]" />
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

      const previousComments = comments;
      const previousCount = commentsCount;

      setComments((prev) => prev.filter((c) => c.commentId !== commentId));
      updateCount(Math.max(0, commentsCount - 1));
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
      className="border-t border-[#2a2a2a] bg-[#121212] px-4 py-6 sm:px-6"
      aria-label="Comments"
    >
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-sm font-semibold text-white">
          Comments
          {commentsCount > 0 ? (
            <span className="ml-2 font-sw-mono text-xs font-normal text-[#909090]">
              {commentsCount}
            </span>
          ) : null}
        </h2>

        <div className="mb-6 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => {
              const next = e.target.value.slice(0, MAX_COMMENT_LENGTH);
              setDraft(next);
              setPostError(null);
            }}
            placeholder="Add a comment…"
            rows={3}
            disabled={posting}
            aria-label="Comment text"
          />
          <div className="flex items-center justify-between gap-3">
            <span
              className={
                atLimit
                  ? "font-sw-mono text-xs text-amber-400"
                  : "font-sw-mono text-xs text-[#737373]"
              }
            >
              {charCount}/{MAX_COMMENT_LENGTH}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!canPost}
              onClick={() => void handlePost()}
              className="bg-[#19c2ad] text-black hover:bg-[#15a896]"
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
            <p className="text-xs text-red-400" role="alert">
              {postError}
            </p>
          ) : null}
        </div>

        {loading ? (
          <CommentListSkeleton />
        ) : loadError ? (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-center">
            <p className="text-sm text-red-400">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-[#404040] bg-transparent text-[#e8e8e8] hover:bg-[#2a2a2a]"
              onClick={() => {
                const ctrl = new AbortController();
                void fetchComments(ctrl.signal);
              }}
            >
              Retry
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#909090]">
            No comments yet — be the first
          </p>
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
              className="border-[#404040] bg-transparent text-[#e8e8e8] hover:bg-[#2a2a2a]"
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
              <p className="text-xs text-red-400" role="alert">
                {loadMoreError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
