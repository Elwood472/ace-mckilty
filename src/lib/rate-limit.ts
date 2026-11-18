import { sql } from "./db";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_HITS = 30;
/** Drop rows whose window is older than this (covers the longest app windows). */
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export type RateLimitOpts = {
  maxHits?: number;
  windowMs?: number;
};

/** Opportunistic purge so auth_rate_limits cannot grow without bound. */
async function maybePurgeStaleRateLimits(): Promise<void> {
  // ~5% of calls — enough for a public app without a dedicated cleanup job.
  if (Math.random() > 0.05) return;
  try {
    await sql(
      `delete from auth_rate_limits
       where window_start < now() - ($1::bigint * interval '1 millisecond')`,
      [STALE_AFTER_MS],
    );
  } catch {
    // Best-effort; never block the request path on cleanup.
  }
}

export async function checkRateLimit(
  key: string,
  opts: RateLimitOpts = {},
): Promise<boolean> {
  await maybePurgeStaleRateLimits();
  const maxHits = opts.maxHits ?? DEFAULT_MAX_HITS;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const rows = await sql<{ hits: number; window_start: string }>(
    "select hits, window_start from auth_rate_limits where key = $1",
    [key],
  );
  const now = Date.now();
  if (rows.length === 0) {
    await sql(
      "insert into auth_rate_limits (key, hits, window_start) values ($1, 1, now())",
      [key],
    );
    return true;
  }
  const row = rows[0];
  const start = new Date(row.window_start).getTime();
  if (now - start > windowMs) {
    await sql(
      "update auth_rate_limits set hits = 1, window_start = now() where key = $1",
      [key],
    );
    return true;
  }
  if (row.hits >= maxHits) return false;
  await sql("update auth_rate_limits set hits = hits + 1 where key = $1", [
    key,
  ]);
  return true;
}

/** Current hits in the active window (0 if missing/expired). Does not bump. */
export async function getRateLimitHits(
  key: string,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<number> {
  const rows = await sql<{ hits: number; window_start: string }>(
    "select hits, window_start from auth_rate_limits where key = $1",
    [key],
  );
  if (rows.length === 0) return 0;
  const start = new Date(rows[0].window_start).getTime();
  if (Date.now() - start > windowMs) return 0;
  return rows[0].hits;
}

/** Increment a counter without enforcing a max (for failure tracking). */
export async function bumpCounter(
  key: string,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<number> {
  await maybePurgeStaleRateLimits();
  const rows = await sql<{ hits: number; window_start: string }>(
    "select hits, window_start from auth_rate_limits where key = $1",
    [key],
  );
  const now = Date.now();
  if (rows.length === 0) {
    await sql(
      "insert into auth_rate_limits (key, hits, window_start) values ($1, 1, now())",
      [key],
    );
    return 1;
  }
  const start = new Date(rows[0].window_start).getTime();
  if (now - start > windowMs) {
    await sql(
      "update auth_rate_limits set hits = 1, window_start = now() where key = $1",
      [key],
    );
    return 1;
  }
  await sql("update auth_rate_limits set hits = hits + 1 where key = $1", [
    key,
  ]);
  return rows[0].hits + 1;
}

export async function clearRateLimit(key: string): Promise<void> {
  await sql("delete from auth_rate_limits where key = $1", [key]);
}
