import "server-only";

import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

export {
  normalizeStoredHttpUrl,
  safeExternalHref,
  safeInternalPath,
} from "./url-safety";

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
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
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

function hostnameOf(u: URL): string {
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
  if (isIP(host) && isBlockedIp(host)) {
    throw new Error("That address is not allowed");
  }
  return u;
}

/** Resolve hostname to public IPs only (rejects private / loopback / metadata). */
export async function resolvePublicAddresses(host: string): Promise<string[]> {
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("That address is not allowed");
    return [host];
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve host");
  }
  if (!records.length) throw new Error("Could not resolve host");
  const addrs = records.map((r) => r.address);
  for (const address of addrs) {
    if (isBlockedIp(address)) {
      throw new Error("That address is not allowed");
    }
  }
  return addrs;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const u = assertHttpUrlShape(raw);
  await resolvePublicAddresses(hostnameOf(u));
  return u;
}

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 750_000;

function headerRecord(
  headersInit?: HeadersInit,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headersInit) return out;
  const h = new Headers(headersInit);
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Connect to a pinned IP so DNS cannot rebind between check and fetch.
 * Sets Host / SNI to the original hostname.
 */
function requestPinned(
  target: URL,
  pinnedIp: string,
  init: {
    method?: string;
    headers?: HeadersInit;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<Response> {
  const isHttps = target.protocol === "https:";
  const lib = isHttps ? https : http;
  const family = pinnedIp.includes(":") ? 6 : 4;
  const headers = headerRecord(init.headers);
  headers.host = target.host;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: pinnedIp,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: init.method || "GET",
        headers,
        servername: isHttps ? hostnameOf(target) : undefined,
        lookup: (_hostname, _options, callback) => {
          const cb = callback as (
            err: Error | null,
            address: string,
            family: number,
          ) => void;
          cb(null, pinnedIp, family);
        },
        family,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy();
            reject(new Error("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const hdrs = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v == null) continue;
            if (Array.isArray(v)) v.forEach((item) => hdrs.append(k, item));
            else hdrs.set(k, v);
          }
          resolve(
            new Response(body, {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers: hdrs,
            }),
          );
        });
        res.on("error", reject);
      },
    );

    const onAbort = () => {
      req.destroy();
      reject(new Error("Aborted"));
    };
    if (init.signal) {
      if (init.signal.aborted) {
        onAbort();
        return;
      }
      init.signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("Timeout"));
    }, init.timeoutMs);
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

/**
 * Server-side fetch that only hits public http(s) hosts.
 * Pins the TCP connection to a validated IP to prevent DNS rebinding.
 */
export async function fetchPublicHttp(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  let current = assertHttpUrlShape(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const addrs = await resolvePublicAddresses(hostnameOf(current));
    const pinnedIp = addrs[0];
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
      res = await requestPinned(current, pinnedIp, {
        method: typeof rest.method === "string" ? rest.method : "GET",
        headers: rest.headers,
        signal: ctrl.signal,
        timeoutMs,
      });
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onAbort);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without Location");
      if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");
      current = assertHttpUrlShape(new URL(location, current).toString());
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
