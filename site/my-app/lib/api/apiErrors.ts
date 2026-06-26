/** Thrown by authenticatedFetch when the API returns a non-2xx response. */
export class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
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
