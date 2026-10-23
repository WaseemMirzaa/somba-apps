import type { NextConfig } from "next";
import path from "node:path";

// Seller-uploaded photos are served by the API under /uploads, so its origin must be an allowed image host.
const apiOrigin = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");
    return { protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, ...(u.port ? { port: u.port } : {}) };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Lets several dev servers / builds run side by side from one checkout (tests, CI).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the workspace root to this directory. The monorepo has lockfiles at both
  // ./ and ../, so Turbopack would otherwise infer the parent (somba-apps/) as the
  // root and recursively watch api/, mobile/ flutter builds and every node_modules,
  // causing a runaway recompile loop that pegs CPU and hangs every request.
  turbopack: {
    root: __dirname,
  },
  images: {
    // Only when the API itself runs on localhost (local development) may the optimizer fetch from a loopback address.
    dangerouslyAllowLocalIP: !!apiOrigin && ["localhost", "127.0.0.1"].includes(apiOrigin.hostname),
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(apiOrigin ? [{ ...apiOrigin, pathname: "/uploads/**" }] : []),
    ],
  },
};

export default nextConfig;
