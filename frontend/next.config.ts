import type { NextConfig } from "next";
import path from "node:path";

const apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL?.replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  // output: 'export' is only valid for `next build` (static S3 deploy),
  // not for `next dev`. Applying it in dev causes the server to hang.
  ...(process.env.NODE_ENV === "production"
    ? { output: "export" as const }
    : {
        async rewrites() {
          // Proxy API calls through localhost in dev to avoid cross-origin CORS.
          if (!apiGatewayUrl) return [];
          return [
            {
              source: "/api/:path*",
              destination: `${apiGatewayUrl}/:path*`,
            },
          ];
        },
      }),
  turbopack: {
    // Pin Turbopack root to this package directory.
    root: path.resolve(__dirname),
  },
  devIndicators: false,
};

export default nextConfig;
