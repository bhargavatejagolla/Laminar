import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disabled: Strict Mode double-mounts effects in dev, creating duplicate WS connections
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.io"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
      {
        source: "/profile_pictures/:path*",
        destination: "http://127.0.0.1:8000/profile_pictures/:path*",
      },
      {
        source: "/storage/:path*",
        destination: "http://127.0.0.1:8000/storage/:path*",
      },
    ];
  },
};

export default nextConfig;
// Force dev server reload: 2026-05-03 17:48:00
