import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // output: 'export' is only valid for `next build` (static S3 deploy),
  // not for `next dev`. Applying it in dev causes the server to hang.
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  turbopack: {
    // The monorepo has a package-lock.json in site/ which confuses Turbopack
    // into using the wrong workspace root. Pin it explicitly to this package.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
