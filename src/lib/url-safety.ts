/**
 * Browser-safe URL helpers (no Node builtins).
 * Client components must import from here, not from `@/lib/urls`.
 */

const USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** http(s) URL or same-origin uploaded profile photo path. */
export function safeProfilePictureSrc(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/profile-photo/")) {
    const rest = trimmed.slice("/api/profile-photo/".length);
    const id = rest.split("?")[0]?.split("#")[0] ?? "";
    if (!USER_ID_RE.test(id)) return null;
    if (trimmed.includes("://") || trimmed.includes("\\")) return null;
    return trimmed;
  }
  return safeExternalHref(trimmed);
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
