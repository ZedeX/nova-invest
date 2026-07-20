import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Phase 2 Performance: LCP < 1s target
  compiler: {
    // Tree-shake moment.js if any dependency pulls it in
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    // Optimize package imports for tree-shaking
    optimizePackageImports: [
      "lightweight-charts",
      "react-grid-layout",
    ],
  },
};

export default nextConfig;
