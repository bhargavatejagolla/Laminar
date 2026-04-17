import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disabled: Strict Mode double-mounts effects in dev, creating duplicate WS connections
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
    ];
  },
};

export default nextConfig;
