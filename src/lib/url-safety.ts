/**
 * Browser-safe URL helpers (no Node builtins).
 * Client components must import from here, not from `@/lib/urls`.
 */

export function safeExternalHref(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Same as safeExternalHref; empty / unsafe becomes "". */
export function normalizeStoredHttpUrl(raw: string): string {
  return safeExternalHref(raw) ?? "";
}

/**
 * Same-origin relative path for post-login redirects.
 * Blocks protocol-relative, backslash open-redirects, and control chars.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  const next = raw.trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.includes("\\") || next.includes("://")) return fallback;
  if (/[\0-\x1f\x7f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://example.invalid");
    if (u.origin !== "https://example.invalid") return fallback;
    if (u.username || u.password) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
