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
    // The monorepo has a package-lock.json in site/ which confuses Turbopack
    // into using the wrong workspace root. Pin it explicitly to this package.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
