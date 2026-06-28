/**
 * Base URL for authenticated API calls.
 *
 * In development, requests go through the Next.js rewrite at `/api/*` so the
 * browser talks same-origin to localhost and avoids API Gateway CORS.
 * In production, calls go directly to NEXT_PUBLIC_API_GATEWAY_URL.
 */
export function getApiBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return '/api';
  }

  const base = process.env.NEXT_PUBLIC_API_GATEWAY_URL?.replace(/\/$/, '');
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_GATEWAY_URL is not set');
  }

  return base;
}
