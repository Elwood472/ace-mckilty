import type { NextConfig } from "next";

/** Public hosts that may POST Server Actions (exact hosts, no wildcards). */
function serverActionOrigins(): string[] {
  const hosts = new Set([
    "ace-mckilty.apps.grok.bot",
    "ace-mckilty.com",
    "www.ace-mckilty.com",
  ]);
  for (const raw of [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      hosts.add(new URL(value).host);
    } catch {
      // ignore invalid override
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  // Cursor App Hosting proxies the public host; without this, Next.js aborts
  // every Server Action with a CSRF origin mismatch (login/signup → ERROR page).
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins(),
      // Default is 1MB; profile photos allow up to 2MB, so leave headroom
      // for multipart framing so our action can return a friendly size error.
      bodySizeLimit: "3mb",
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
