import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share card and banner read these font files at runtime.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./src/assets/fonts/**"],
    "/twitter-image": ["./src/assets/fonts/**"],
    "/banner.png": ["./src/assets/fonts/**"],
  },
};

export default nextConfig;
