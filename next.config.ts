import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  async redirects() {
    return [
      // Canonical host: bounce the raw Vercel deployment domain to flickclip.io
      // so clippers never get stranded on *.vercel.app (which breaks the X
      // OAuth cookie round-trip). /api/* is excluded so the OAuth callback and
      // cron endpoints are never cross-origin redirected.
      {
        source: "/",
        has: [{ type: "host", value: "bodoggos-clipping.vercel.app" }],
        destination: "https://flickclip.io/",
        permanent: false,
      },
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "bodoggos-clipping.vercel.app" }],
        destination: "https://flickclip.io/:path",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
