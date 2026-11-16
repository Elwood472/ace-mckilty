/**
 * Absolute public origin for outbound links (invites, password reset).
 * Prefer APP_BASE_URL; default to the friendly custom domain.
 */
export function appBaseUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://ace-mckilty.com";
}

export function absoluteAppUrl(path: string): string {
  const base = appBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
