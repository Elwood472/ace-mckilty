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

export const MAX_DUMP_BYTES = 2_000_000;

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

/** Constant-time compare for IMPORT_SECRET (length mismatch → false). */
export function importSecretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function getImportSecret(): string {
  return process.env.IMPORT_SECRET?.trim() ?? "";
}

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ""
  );
}

export async function countUsers(): Promise<number | null> {
  const url = databaseUrl();
  if (!url) {
    // Local PGlite — use app sql helper via dynamic import to avoid cycles.
    const { sql } = await import("./db");
    const rows = await sql<{ n: number }>("select count(*)::int as n from users");
    return rows[0]?.n ?? 0;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const exists = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );
    if (!exists.rowCount) return null;
    const countRes = await client.query("select count(*)::int as n from users");
    return (countRes.rows[0]?.n as number) ?? 0;
  } finally {
    await client.end();
  }
}

/**
 * Import dump when users table is empty. Never logs PII.
 * Returns per-table row attempt counts only.
 */
export async function importDumpRequireEmpty(
  dump: GiftRegistryDump,
  opts: { skipEphemeral?: boolean } = {},
): Promise<Record<string, number>> {
  const skipEphemeral = opts.skipEphemeral ?? true;
  const url = databaseUrl();
  if (!url) {
    throw new Error("NO_DATABASE_URL");
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const imported: Record<string, number> = {};
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '60s'");
    await client.query("select pg_advisory_xact_lock(7272742)");

    const mig = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );
    if (!mig.rowCount) {
      throw new Error("SCHEMA_MISSING");
    }

    const countRes = await client.query(
      "select count(*)::int as n from users",
    );
    const n = (countRes.rows[0]?.n as number) ?? 0;
    if (n > 0) {
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

    await client.query("commit");
    return imported;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}
