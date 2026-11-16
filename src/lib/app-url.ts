/**
 * Absolute public origin for outbound links (invites, password reset).
 * Prefer APP_BASE_URL / NEXT_PUBLIC_APP_URL when set to a real https origin.
 * Fallback is the Cursor-hosted app host (path-preserving). Apex
 * ace-mckilty.com forwarding currently strips paths — only set APP_BASE_URL
 * to that domain after Squarespace "Maintain paths" works end-to-end.
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
  // Hosted default — override with APP_BASE_URL when the public brand URL
  // preserves paths (invites / reset links must not land on "/").
  return "https://ace-mckilty.apps.grok.bot";
}

export function absoluteAppUrl(path: string): string {
  const base = appBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
