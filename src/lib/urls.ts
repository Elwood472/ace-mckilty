import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return -1;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n < 0) return true;
  // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16,
  // 100.64/10 (CGNAT), 192.0.0.0/24, 192.0.2.0/24, 198.18/15, 198.51.100/24,
  // 203.0.113/24, 224/4 multicast, 240/4 reserved
  const blocked: Array<[number, number]> = [
    [0x00000000, 0xff000000],
    [0x0a000000, 0xff000000],
    [0x7f000000, 0xff000000],
    [0xa9fe0000, 0xffff0000],
    [0xac100000, 0xfff00000],
    [0xc0a80000, 0xffff0000],
    [0x64400000, 0xffc00000],
    [0xc0000000, 0xffffff00],
    [0xc0000200, 0xffffff00],
    [0xc6120000, 0xfffe0000],
    [0xc6336400, 0xffffff00],
    [0xcb007100, 0xffffff00],
    [0xe0000000, 0xf0000000],
    [0xf0000000, 0xf0000000],
  ];
  return blocked.some(
    ([base, mask]) => ((n & mask) >>> 0) === (base >>> 0),
  );
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  // Unique local fc00::/7, link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  // IPv4-mapped
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

/**
 * Sync check for href/src attributes: only http(s) with a hostname.
 * Rejects javascript:, data:, and protocol-relative tricks.
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

/** Same as safeExternalHref; empty string becomes "". */
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
  // Disallow embedding credentials-looking absolute URLs via weird parsing
  try {
    const u = new URL(next, "https://example.invalid");
    if (u.origin !== "https://example.invalid") return fallback;
    if (u.username || u.password) return fallback;
  } catch {
    return fallback;
  }
  return next;
}

function hostnameOf(u: URL): string {
  // Node may keep brackets on IPv6 literals (e.g. "[::1]").
  return u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function assertHttpUrlShape(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (u.username || u.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const host = hostnameOf(u);
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error("That host is not allowed");
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That host is not allowed");
  }
  // Literal IP in the hostname
  if (isIP(host) && isBlockedIp(host)) {
    throw new Error("That address is not allowed");
  }
  return u;
}

/** Resolve hostname and reject private / loopback / metadata targets. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const u = assertHttpUrlShape(raw);
  const host = hostnameOf(u);
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("That address is not allowed");
    return u;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve host");
  }
  if (!records.length) throw new Error("Could not resolve host");
  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      throw new Error("That address is not allowed");
    }
  }
  return u;
}

const MAX_REDIRECTS = 5;

/**
 * Server-side fetch that only hits public http(s) hosts.
 * Validates the initial URL and every redirect target (DNS + IP).
 */
export async function fetchPublicHttp(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  let current = (await assertPublicHttpUrl(rawUrl)).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const userSignal = rest.signal;
    const onAbort = () => ctrl.abort();
    if (userSignal) {
      if (userSignal.aborted) ctrl.abort();
      else userSignal.addEventListener("abort", onAbort, { once: true });
    }
    let res: Response;
    try {
      res = await fetch(current, {
        ...rest,
        signal: ctrl.signal,
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onAbort);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("Redirect without Location");
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }
      const next = new URL(location, current).toString();
      current = (await assertPublicHttpUrl(next)).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
