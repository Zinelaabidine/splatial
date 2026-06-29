function shouldUseDevApiProxy(): boolean {
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  // `next dev` on a LAN IP (e.g. 192.168.x.x:3000) must still use the
  // same-origin rewrite — the dev API gateway CORS allowlist is localhost-only.
  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;
    const isLoopback = hostname === "localhost" || hostname === "127.0.0.1";
    const isPrivateLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
    if ((isLoopback || isPrivateLan) && port === "3000") {
      return true;
    }
  }

  return false;
}

/**
 * Base URL for authenticated API calls.
 *
 * In development, requests go through the Next.js rewrite at `/api/*` so the
 * browser talks same-origin to localhost and avoids API Gateway CORS.
 * In production, calls go directly to NEXT_PUBLIC_API_GATEWAY_URL.
 */
export function getApiBaseUrl(): string {
  if (shouldUseDevApiProxy()) {
    return "/api";
  }

  const base = process.env.NEXT_PUBLIC_API_GATEWAY_URL?.replace(/\/$/, '');
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_GATEWAY_URL is not set');
  }

  return base;
}
