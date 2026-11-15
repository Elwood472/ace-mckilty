import { sql } from "./db";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_HITS = 30;

export type RateLimitOpts = {
  maxHits?: number;
  windowMs?: number;
};

export async function checkRateLimit(
  key: string,
  opts: RateLimitOpts = {},
): Promise<boolean> {
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
