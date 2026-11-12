import { sql } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 30;

export async function checkRateLimit(key: string): Promise<boolean> {
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
  if (now - start > WINDOW_MS) {
    await sql(
      "update auth_rate_limits set hits = 1, window_start = now() where key = $1",
      [key],
    );
    return true;
  }
  if (row.hits >= MAX_HITS) return false;
  await sql("update auth_rate_limits set hits = hits + 1 where key = $1", [
    key,
  ]);
  return true;
}
