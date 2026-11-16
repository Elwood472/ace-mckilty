/**
 * Absolute public origin for outbound links (invites, password reset).
 * Prefer APP_BASE_URL when it is a real https origin; otherwise the
 * friendly custom domain, then the hosted app host.
 */
export function appBaseUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      if (u.protocol === "https:" || u.protocol === "http:") {
        return u.origin;
      }
    } catch {
      // ignore invalid override
    }
  }
  return "https://ace-mckilty.com";
}

export function absoluteAppUrl(path: string): string {
  const base = appBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
