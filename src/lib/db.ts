import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function postgresConnectionString(): string {
  if (!databaseUrl) return "";
  const local =
    /localhost|127\.0\.0\.1/i.test(databaseUrl) ||
    databaseUrl.includes("sslmode=disable");
  if (local || /[?&]sslmode=/i.test(databaseUrl)) return databaseUrl;
  // Hosted DB: require TLS with certificate verification (no insecure skip).
  const sep = databaseUrl.includes("?") ? "&" : "?";
  return `${databaseUrl}${sep}sslmode=verify-full`;
}

function createPool(): pg.Pool {
  return new pg.Pool({
    connectionString: postgresConnectionString(),
    max: 5,
  });
}

async function getPool(): Promise<pg.Pool> {
  pool ??= createPool();
  await ensurePostgresMigrations(pool);
  return pool;
}

async function migrationDirs(): Promise<string[]> {
  const candidates = [
    path.join(process.cwd(), "migrations"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations"),
  ];
  const found: string[] = [];
  for (const dir of candidates) {
    try {
      const files = await readdir(dir);
      if (files.some((f) => f.endsWith(".sql"))) found.push(dir);
    } catch {
      // missing
    }
  }
  return found;
}

/** Apply SQL migrations once per process (same tracking as scripts/migrate.mjs). */
async function ensurePostgresMigrations(db: pg.Pool): Promise<void> {
  if (!globalForDb.__giftRegistryPgReady) {
    globalForDb.__giftRegistryPgReady = (async () => {
      const client = await db.connect();
      try {
        // Optional on managed Postgres; PG13+ has gen_random_uuid() in core.
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
        const dirs = await migrationDirs();
        const seen = new Set<string>();
        for (const dir of dirs) {
          const files = (await readdir(dir))
            .filter((f) => f.endsWith(".sql"))
            .sort();
          for (const file of files) {
            if (done.has(file) || seen.has(file)) continue;
            seen.add(file);
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
        }
        if (seen.size === 0 && done.size === 0) {
          console.warn(
            "[db] no migration SQL files found under cwd or package paths",
          );
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
