import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export' is only valid for `next build` (static S3 deploy),
  // not for `next dev`. Applying it in dev causes the server to hang.
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
};

export default nextConfig;
