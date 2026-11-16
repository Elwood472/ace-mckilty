import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor App Hosting proxies the public host; without this, Next.js aborts
  // every Server Action with a CSRF origin mismatch (login/signup → ERROR page).
  experimental: {
    serverActions: {
      // Exact public host only — no wildcard apps.grok.bot origins.
      allowedOrigins: ["ace-mckilty.apps.grok.bot"],
    },
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
