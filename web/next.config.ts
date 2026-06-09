import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory. The monorepo has lockfiles at both
  // ./ and ../, so Turbopack would otherwise infer the parent (somba-apps/) as the
  // root and recursively watch api/, mobile/ flutter builds and every node_modules,
  // causing a runaway recompile loop that pegs CPU and hangs every request.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
