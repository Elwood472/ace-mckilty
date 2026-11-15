import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
let pool: pg.Pool | undefined;

type SqlFn = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

const globalForDb = globalThis as unknown as {
  __giftRegistryPglite?: Promise<PGlite>;
  __giftRegistryPgReady?: Promise<void>;
};

function createPool(): pg.Pool {
  // Use DATABASE_URL exactly as the host provides it (including sslmode).
  // Do not force rejectUnauthorized:false or rewrite TLS — that either fails
  // review or breaks hosted Postgres.
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 30_000,
  });
}

async function getPool(): Promise<pg.Pool> {
  pool ??= createPool();
  await ensurePostgresMigrations(pool);
  return pool;
}

/** Apply SQL migrations once per process (same tracking as scripts/migrate.mjs). */
async function ensurePostgresMigrations(db: pg.Pool): Promise<void> {
  if (!globalForDb.__giftRegistryPgReady) {
    globalForDb.__giftRegistryPgReady = (async () => {
      const client = await db.connect();
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
    return (await db.query(text, params)).rows as T[];
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
  await db.query("begin");
  try {
    const query: SqlFn = async <R = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) => (await db.query<R>(text, params)).rows;
    const result = await fn(query);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function getLocal(): Promise<PGlite> {
  globalForDb.__giftRegistryPglite ??= startLocal().catch((error: unknown) => {
    globalForDb.__giftRegistryPglite = undefined;
    throw error;
  });
  return globalForDb.__giftRegistryPglite;
}

/**
 * File-backed PGlite under `.data/pglite`. Survives process restarts.
 * Never delete `.data` during normal testing — that wipes local accounts.
 */
async function startLocal(): Promise<PGlite> {
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
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
