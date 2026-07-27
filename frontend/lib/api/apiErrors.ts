/** Thrown by authenticatedFetch when the API returns a non-2xx response. */
export class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

/** True when the caller aborted the request (Strict Mode cleanup, navigation, etc.). */
export function isAbortError(err: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

/** Browser network failures (dev-server restart, offline tab, proxy race). */
export function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  return /failed to fetch|networkerror|load failed/i.test(err.message);
}

/** Conflict responses that reflect scene lifecycle state, not client bugs. */
export function isExpectedSceneConflict(err: unknown): boolean {
  if (!(err instanceof ApiRequestError) || err.statusCode !== 409) {
    return false;
  }

  const msg = err.message;
  return (
    msg.includes("Scene is not ready") ||
    msg.includes("no viewable") ||
    msg.includes("no PLY file")
  );
}

/** Free-plan weekly training quota exhausted (see backend/lib/quota.js). */
export function isQuotaExceededError(err: unknown): boolean {
  if (!(err instanceof ApiRequestError) || err.statusCode !== 429) {
    return false;
  }
  return err.message.includes("Weekly training quota exceeded");
}

/**
 * A submit was refused because the scene's state moved under us — almost
 * always because a job is already queued or running for it (see
 * submit-job.js's SUBMITTABLE set and its ConditionExpression).
 *
 * Worth distinguishing from a generic failure: refetching the scene list
 * resolves it, and telling the user to "try again" is actively misleading
 * when the real answer is "it's already running".
 */
export function isSubmitConflictError(err: unknown): boolean {
  return err instanceof ApiRequestError && err.statusCode === 409;
}

/**
 * A scene has no file attached, so there is nothing to train.
 * submit-job.js answers 422 for this rather than 409.
 */
export function isMissingUploadError(err: unknown): boolean {
  return err instanceof ApiRequestError && err.statusCode === 422;
}
