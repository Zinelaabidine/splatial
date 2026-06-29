"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  Comment,
  CommentsResponse,
  DeleteCommentResponse,
} from "@/types/api";

export const MAX_COMMENT_LENGTH = 1000;

export async function listComments(
  sceneId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CommentsResponse> {
  const base = `/api/v1/scenes/${encodeURIComponent(sceneId)}/comments`;
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
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
      signal,
    },
  ) as Promise<Comment>;
}

export async function deleteComment(
  sceneId: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<DeleteCommentResponse> {
  return authenticatedFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: "DELETE",
      signal,
    },
  ) as Promise<DeleteCommentResponse>;
}
