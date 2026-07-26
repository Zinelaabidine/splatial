/**
 * Shared path builders for comment API routes.
 *
 * `commentId` values look like `2026-07-26T10:46:10.783Z#24a6d82a-...`
 * (ISO timestamp + `#` + uuid). An unencoded `#` is a URL fragment
 * delimiter — the browser strips everything from `#` onward before the
 * request ever leaves the tab — and `:` needs escaping too. Every dynamic
 * path segment must go through `encodeURIComponent()` exactly once, and
 * only here. Do not concatenate a raw `sceneId` / `commentId` into a fetch
 * URL anywhere else; import these builders instead.
 */

/** `/api/v1/scenes/{sceneId}/comments` */
export function commentsListPath(sceneId: string): string {
  return `/api/v1/scenes/${encodeURIComponent(sceneId)}/comments`;
}

/** `/api/v1/scenes/{sceneId}/comments/{commentId}` */
export function commentPath(sceneId: string, commentId: string): string {
  return `${commentsListPath(sceneId)}/${encodeURIComponent(commentId)}`;
}

/** `/api/v1/scenes/{sceneId}/comments/{commentId}/reaction` */
export function commentReactionPath(sceneId: string, commentId: string): string {
  return `${commentPath(sceneId, commentId)}/reaction`;
}

/** `/api/v1/scenes/{sceneId}/comments/{commentId}/replies` */
export function commentRepliesPath(sceneId: string, commentId: string): string {
  return `${commentPath(sceneId, commentId)}/replies`;
}
