import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { ensurePasswordBootstrap } from "@/lib/password-bootstrap";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const DB_HARD_TIMEOUT_MS = 10_000;
let pool: pg.Pool | undefined;

type SqlFn = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

type PGliteLike = {
  waitReady: Promise<unknown>;
  exec: (sql: string) => Promise<unknown>;
  query: <T>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

const globalForDb = globalThis as unknown as {
  __giftRegistryPglite?: Promise<PGliteLike>;
  __giftRegistryPgReady?: Promise<void>;
};

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${DB_HARD_TIMEOUT_MS}ms`));
    }, DB_HARD_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function createPool(): pg.Pool {
  // Use DATABASE_URL exactly as the host provides it (including sslmode).
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: DB_HARD_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
  });
}

async function getPool(): Promise<pg.Pool> {
  pool ??= createPool();
  await withTimeout(ensurePostgresMigrations(pool), "postgres migrations");
  return pool;
}

/** Apply SQL migrations once per process (same tracking as scripts/migrate.mjs). */
async function ensurePostgresMigrations(db: pg.Pool): Promise<void> {
  if (!globalForDb.__giftRegistryPgReady) {
    globalForDb.__giftRegistryPgReady = (async () => {
      const client = await db.connect();
      try {
        await client.query("set statement_timeout = '8s'");
        await client.query("set lock_timeout = '8s'");
        // Serialize first-boot migrations across concurrent login/signup workers.
        await client.query("select pg_advisory_lock(7272741)");
        try {
          try {
            await client.query("create extension if not exists pgcrypto");
          } catch (e) {
            console.warn("[db] pgcrypto extension skipped", e);
          }
          await client.query(
            `create table if not exists schema_migrations (
               name text primary key,
               applied_at timestamptz not null default now()
             )`,
          );
          const done = new Set(
            (
              await client.query<{ name: string }>(
                "select name from schema_migrations",
              )
            ).rows.map((r) => r.name),
          );
          const dir = path.join(process.cwd(), "migrations");
          const files = (await readdir(dir).catch(() => []))
            .filter((f) => f.endsWith(".sql"))
            .sort();
          for (const file of files) {
            if (done.has(file)) continue;
            await client.query("begin");
            try {
              await client.query(await readFile(path.join(dir, file), "utf8"));
              await client.query(
                "insert into schema_migrations (name) values ($1)",
                [file],
              );
              await client.query("commit");
              console.info(`[db] applied migration ${file}`);
            } catch (error) {
              await client.query("rollback");
              throw error;
            }
          }
          if (files.length === 0 && done.size === 0) {
            console.warn("[db] no migration files found at", dir);
          }
          try {
            await ensurePasswordBootstrap(client);
          } catch (e) {
            console.warn("[db] password bootstrap skipped", e);
          }
        } finally {
          await client.query("select pg_advisory_unlock(7272741)").catch(() => {});
        }
      } finally {
        client.release();
      }
    })().catch((error: unknown) => {
      globalForDb.__giftRegistryPgReady = undefined;
      throw error;
    });
  }
  await globalForDb.__giftRegistryPgReady;
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    const db = await getPool();
    return (
      await withTimeout(db.query(text, params), "postgres query")
    ).rows as T[];
  }
  const db = await getLocal();
  return (await db.query<T>(text, params)).rows;
}

/** Run multiple statements in one transaction (Postgres or PGlite). */
export async function withTransaction<T>(
  fn: (query: SqlFn) => Promise<T>,
): Promise<T> {
  if (databaseUrl !== "") {
    const db = await getPool();
    const client = await db.connect();
    try {
      await client.query("begin");
      const query: SqlFn = async <R = Record<string, unknown>>(
        text: string,
        params: unknown[] = [],
      ) => (await client.query(text, params)).rows as R[];
      const result = await fn(query);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = await getLocal();
  await db.exec("begin");
  try {
    const query: SqlFn = async <R = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) => (await db.query<R>(text, params)).rows;
    const result = await fn(query);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function getLocal(): Promise<PGliteLike> {
  // Hosted apps must use DATABASE_URL — never fall back to file PGlite there.
  if (process.env.NODE_ENV === "production" && !databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  globalForDb.__giftRegistryPglite ??= startLocal().catch((error: unknown) => {
    globalForDb.__giftRegistryPglite = undefined;
    throw error;
  });
  return globalForDb.__giftRegistryPglite;
}

/**
 * File-backed PGlite under `.data/pglite`. Loaded only for local/dev —
 * never imported when DATABASE_URL is set (avoids WASM crashes on host).
 */
async function startLocal(): Promise<PGliteLike> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir) as unknown as PGliteLike;
  await db.waitReady;

  await db.exec(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const done = new Set(
    (
      await db.query<{ name: string }>("select name from schema_migrations")
    ).rows.map((r) => r.name),
  );
  const files = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
    await db.query("insert into schema_migrations (name) values ($1)", [file]);
  }
  return db;
}
