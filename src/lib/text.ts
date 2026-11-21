/**
 * Cap and sanitize short user-facing labels (display names, list titles)
 * so they cannot bloat outbound mail or UI if reintroduced into templates.
 */

const CONTROL_OR_INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

export function sanitizePublicLabel(
  raw: string,
  maxLen: number,
): string | null {
  const cleaned = raw.replace(CONTROL_OR_INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLen) return cleaned.slice(0, maxLen).trim() || null;
  return cleaned;
}

export const DISPLAY_NAME_MAX = 60;
export const LIST_TITLE_MAX = 100;
