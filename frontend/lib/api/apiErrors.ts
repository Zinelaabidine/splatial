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
