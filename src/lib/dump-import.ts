import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";

/** Keep aligned with scripts/lib/dump-import-core.mjs */
export const DUMP_FORMAT = "ace-mckilty-gift-registry-pglite-v1";

const TABLE_ORDER = [
  "users",
  "sessions",
  "groups",
  "group_members",
  "group_invites",
  "wish_lists",
  "wish_list_owners",
  "items",
  "item_viewers",
  "purchases",
  "budgets",
  "couples",
  "list_access",
  "list_invites",
  "list_access_requests",
  "schema_migrations",
  "auth_rate_limits",
] as const;

const EPHEMERAL = new Set(["sessions", "auth_rate_limits"]);

/** Max dump JSON size (paste or file). */
export const MAX_DUMP_BYTES = 1_500_000;

type DumpTable = {
  columns: { name: string }[];
  rows: Record<string, unknown>[];
};

export type GiftRegistryDump = {
  format: string;
  tables: Record<string, DumpTable | undefined>;
};

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (
    typeof v === "object" &&
    v !== null &&
    "__type" in v &&
    (v as { __type?: string }).__type === "buffer" &&
    "base64" in v &&
    typeof (v as { base64?: unknown }).base64 === "string"
  ) {
    return Buffer.from((v as { base64: string }).base64, "base64");
  }
  return v;
}

export function parseDumpJson(text: string): GiftRegistryDump {
  if (text.length > MAX_DUMP_BYTES) {
    throw new Error("DUMP_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("DUMP_INVALID_JSON");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as GiftRegistryDump).format !== DUMP_FORMAT ||
    !(parsed as GiftRegistryDump).tables ||
    typeof (parsed as GiftRegistryDump).tables !== "object"
  ) {
    throw new Error("DUMP_BAD_FORMAT");
  }
  return parsed as GiftRegistryDump;
}

/** Constant-time compare via SHA-256 digests (length-safe). */
export function importSecretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function getImportSecret(): string {
  return process.env.IMPORT_SECRET?.trim() ?? "";
}

/** True only when a non-empty IMPORT_SECRET is configured. */
export function isImportSecretConfigured(): boolean {
  return getImportSecret().length > 0;
}

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ""
  );
}

function pgClient(connectionString: string): pg.Client {
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8_000,
  });
}

async function ensureImportLockTable(
  query: (text: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }>,
): Promise<void> {
  await query(`
    create table if not exists data_import_lock (
      id boolean primary key default true check (id),
      locked_at timestamptz not null default now()
    )
  `);
}

export type ImportGate = {
  /** Secrets configured and import not permanently locked. */
  available: boolean;
  locked: boolean;
  userCount: number | null;
  /** Empty DB, or sole bootstrap user matching sessionUserId. */
  eligible: boolean;
};

/**
 * Gate for /import-data. Does not reveal why unavailable to callers that 404.
 */
export async function getImportGate(sessionUserId?: string): Promise<ImportGate> {
  if (!isImportSecretConfigured()) {
    return { available: false, locked: false, userCount: null, eligible: false };
  }

  const url = databaseUrl();
  if (!url) {
    // Local PGlite: import path is hosted-only.
    return { available: false, locked: false, userCount: null, eligible: false };
  }

  const client = pgClient(url);
  await client.connect();
  try {
    const query = async (text: string, params: unknown[] = []) =>
      client.query(text, params);
    await ensureImportLockTable(query);

    const lock = await client.query("select 1 from data_import_lock limit 1");
    if (lock.rowCount) {
      return { available: false, locked: true, userCount: null, eligible: false };
    }

    const usersExist = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );
    if (!usersExist.rowCount) {
      return { available: true, locked: false, userCount: null, eligible: false };
    }

    const seeded = await client.query(
      `select 1 from users
       where lower(email) in ('bluesbrthr@gmail.com', 'cmebray@gmail.com')
       limit 1`,
    );
    if (seeded.rowCount) {
      return { available: false, locked: true, userCount: null, eligible: false };
    }

    const countRes = await client.query<{ n: number }>(
      "select count(*)::int as n from users",
    );
    const userCount = countRes.rows[0]?.n ?? 0;

    let eligible = userCount === 0;
    if (!eligible && userCount === 1 && sessionUserId) {
      const sole = await client.query<{ id: string }>(
        "select id from users limit 1",
      );
      eligible = sole.rows[0]?.id === sessionUserId;
    }

    return {
      available: true,
      locked: false,
      userCount,
      eligible,
    };
  } finally {
    await client.end();
  }
}

/**
 * Import dump for an authenticated bootstrap operator.
 * Requires: empty users OR sole user === operatorId.
 * Wipes app tables (not data_import_lock) when replacing a bootstrap user,
 * then imports, then sets the permanent lock in the same transaction.
 * Never logs PII.
 */
export async function importDumpRequireEmpty(
  dump: GiftRegistryDump,
  opts: { skipEphemeral?: boolean; operatorId: string },
): Promise<Record<string, number>> {
  const skipEphemeral = opts.skipEphemeral ?? true;
  const operatorId = opts.operatorId;
  const url = databaseUrl();
  if (!url) {
    throw new Error("NO_DATABASE_URL");
  }

  const client = pgClient(url);
  await client.connect();
  const imported: Record<string, number> = {};
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '60s'");
    await client.query("select pg_advisory_xact_lock(7272742)");

    await ensureImportLockTable((text, params = []) =>
      client.query(text, params),
    );

    const lock = await client.query("select 1 from data_import_lock limit 1");
    if (lock.rowCount) {
      throw new Error("REFUSE_LOCKED");
    }

    const mig = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );
    if (!mig.rowCount) {
      throw new Error("SCHEMA_MISSING");
    }

    // Never re-seed after the known imported accounts already exist.
    const seeded = await client.query(
      `select 1 from users
       where lower(email) in ('bluesbrthr@gmail.com', 'cmebray@gmail.com')
       limit 1`,
    );
    if (seeded.rowCount) {
      throw new Error("REFUSE_LOCKED");
    }

    const countRes = await client.query<{ n: number }>(
      "select count(*)::int as n from users",
    );
    const n = countRes.rows[0]?.n ?? 0;
    if (n > 1) {
      throw new Error("REFUSE_NOT_EMPTY");
    }
    if (n === 1) {
      const sole = await client.query<{ id: string }>(
        "select id from users limit 1",
      );
      if (sole.rows[0]?.id !== operatorId) {
        throw new Error("REFUSE_NOT_EMPTY");
      }
      // Replace bootstrap account with dump contents.
      for (const name of [...TABLE_ORDER].reverse()) {
        if (name === "schema_migrations") continue;
        const exists = await client.query(
          `select 1 from information_schema.tables
           where table_schema = 'public' and table_name = $1`,
          [name],
        );
        if (!exists.rowCount) continue;
        await client.query(
          `truncate table ${quoteIdent(name)} restart identity cascade`,
        );
      }
    } else if (n !== 0) {
      throw new Error("REFUSE_NOT_EMPTY");
    }

    for (const name of TABLE_ORDER) {
      if (skipEphemeral && EPHEMERAL.has(name)) continue;
      const table = dump.tables[name];
      if (!table || !table.rows?.length) {
        imported[name] = 0;
        continue;
      }

      if (name === "schema_migrations") {
        let count = 0;
        for (const row of table.rows) {
          await client.query(
            `insert into schema_migrations (name, applied_at)
             values ($1, $2)
             on conflict (name) do nothing`,
            [row.name, normalizeValue(row.applied_at)],
          );
          count += 1;
        }
        imported[name] = count;
        continue;
      }

      const cols = table.columns.map((c) => c.name);
      const colList = cols.map(quoteIdent).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const pkCols = (
        await client.query(
          `select a.attname as name
           from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
           where i.indrelid = $1::regclass and i.indisprimary`,
          [name],
        )
      ).rows.map((r: { name: string }) => r.name);

      let insertSql = `insert into ${quoteIdent(name)} (${colList}) values (${placeholders})`;
      if (pkCols.length) {
        insertSql += ` on conflict (${pkCols.map(quoteIdent).join(", ")}) do nothing`;
      }

      let count = 0;
      for (const row of table.rows) {
        const values = cols.map((c) => normalizeValue(row[c]));
        await client.query(insertSql, values);
        count += 1;
      }
      imported[name] = count;
    }

    await client.query(
      `insert into data_import_lock (id, locked_at) values (true, now())
       on conflict (id) do nothing`,
    );

    await client.query("commit");
    return imported;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}
