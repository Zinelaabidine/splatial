"use client";

import { authenticatedFetch } from "@/services/apiClient";
import {
  commentPath,
  commentRepliesPath,
  commentsListPath,
} from "@/lib/api/commentPaths";
import type {
  Comment,
  CommentsResponse,
  DeleteCommentResponse,
  RepliesResponse,
} from "@/types/api";

export const MAX_COMMENT_LENGTH = 1000;

export async function listComments(
  sceneId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CommentsResponse> {
  const base = commentsListPath(sceneId);
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<CommentsResponse>;
}

export async function createComment(
  sceneId: string,
  body: string,
  signal?: AbortSignal,
): Promise<Comment> {
  return authenticatedFetch(commentsListPath(sceneId), {
    method: "POST",
    body: JSON.stringify({ body }),
    signal,
  }) as Promise<Comment>;
}

export async function deleteComment(
  sceneId: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<DeleteCommentResponse> {
  return authenticatedFetch(commentPath(sceneId, commentId), {
    method: "DELETE",
    signal,
  }) as Promise<DeleteCommentResponse>;
}

export async function listReplies(
  sceneId: string,
  commentId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<RepliesResponse> {
  const base = commentRepliesPath(sceneId, commentId);
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<RepliesResponse>;
}

export async function createReply(
  sceneId: string,
  commentId: string,
  body: string,
  signal?: AbortSignal,
): Promise<Comment> {
  return authenticatedFetch(commentRepliesPath(sceneId, commentId), {
    method: "POST",
    body: JSON.stringify({ body }),
    signal,
  }) as Promise<Comment>;
}
