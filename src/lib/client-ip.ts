import { headers } from "next/headers";
import { checkRateLimit, type RateLimitOpts } from "@/lib/rate-limit";

/**
 * Client IP for rate limiting.
 * Prefer proxy-set single-value headers; never trust the leftmost
 * X-Forwarded-For entry (clients can prepend spoofed addresses).
 *
 * Returns null when no recognizable IP is available — callers must not
 * share a single "unknown" rate-limit bucket across those requests.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();

  for (const name of [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
    "x-vercel-forwarded-for",
  ] as const) {
    const v = h.get(name)?.trim();
    if (v && !v.includes(",")) return v.slice(0, 64);
    if (v) {
      // Some platforms still comma-join; take the rightmost hop.
      const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last.slice(0, 64);
    }
  }

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    // Rightmost is the address the nearest trusted proxy observed.
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 64);
  }

  return null;
}

/**
 * Per-IP rate limit. Fails closed when IP cannot be determined (no shared
 * fallback bucket that unrelated clients would collide in).
 */
export async function checkClientIpRateLimit(
  keyPrefix: string,
  opts?: RateLimitOpts,
): Promise<boolean> {
  const ip = await getClientIp();
  if (!ip) return false;
  return checkRateLimit(`${keyPrefix}:${ip}`, opts);
}
