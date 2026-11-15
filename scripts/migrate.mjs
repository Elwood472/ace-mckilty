import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim() ?? "";
const files = (await readdir("migrations").catch(() => []))
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (url === "" || files.length === 0) {
  console.log("migrate: nothing to do");
  process.exit(0);
}
let conn = process.env.DATABASE_URL_UNPOOLED?.trim() || url;
const local =
  /localhost|127\.0\.0\.1/i.test(conn) || conn.includes("sslmode=disable");
if (!local && !/[?&]sslmode=/i.test(conn)) {
  conn += (conn.includes("?") ? "&" : "?") + "sslmode=verify-full";
}
const client = new pg.Client({ connectionString: conn });
await client.connect();
try {
  await client.query("set lock_timeout = '60s'");
  await client.query("select pg_advisory_lock(7272741)");
  try {
    await client.query("create extension if not exists pgcrypto");
  } catch (e) {
    console.warn("migrate: pgcrypto skipped", e instanceof Error ? e.message : e);
  }
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await client.query("select name from schema_migrations")).rows.map(
      (r) => r.name,
    ),
  );
  for (const file of files.filter((f) => !done.has(f))) {
    await client.query("begin");
    try {
      await client.query(await readFile(`migrations/${file}`, "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [
        file,
      ]);
      await client.query("commit");
      console.log(`migrate: applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
