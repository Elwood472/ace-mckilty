/**
 * Shared dump → Postgres import core (CLI + docs).
 * Keep algorithm aligned with src/lib/dump-import.ts.
 * Logs table row counts only — never emails, hashes, or row contents.
 */

export const DUMP_FORMAT = "ace-mckilty-gift-registry-pglite-v1";

/** Parents before children — must match export order. */
export const TABLE_ORDER = [
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
];

export const EPHEMERAL = new Set(["sessions", "auth_rate_limits"]);

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function normalizeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && v.__type === "buffer") {
    return Buffer.from(v.base64, "base64");
  }
  return v;
}

export function assertDumpShape(dump) {
  if (!dump || typeof dump !== "object" || dump.format !== DUMP_FORMAT) {
    throw new Error("Unrecognized dump format");
  }
  if (!dump.tables || typeof dump.tables !== "object") {
    throw new Error("Dump missing tables");
  }
}

/**
 * @param {import('pg').Client | { query: Function }} client
 * @param {object} dump
 * @param {{ wipe?: boolean, skipEphemeral?: boolean, requireEmpty?: boolean, log?: (msg: string) => void }} opts
 */
export async function importDumpWithClient(client, dump, opts = {}) {
  const wipe = Boolean(opts.wipe);
  const skipEphemeral = Boolean(opts.skipEphemeral);
  const requireEmpty = Boolean(opts.requireEmpty);
  const log = opts.log ?? (() => {});

  assertDumpShape(dump);

  await client.query("set local lock_timeout = '60s'");
  // Serialize empty-DB imports (same namespace family as migrate advisory lock).
  await client.query("select pg_advisory_xact_lock(7272742)");

  const mig = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'users'`,
  );
  if (!mig.rowCount) {
    throw new Error("Schema missing (no users table). Run migrate first.");
  }

  if (requireEmpty) {
    const countRes = await client.query(
      "select count(*)::int as n from users",
    );
    const n = countRes.rows[0]?.n ?? 0;
    if (n > 0) {
      throw new Error("REFUSE_NOT_EMPTY");
    }
  }

  if (wipe) {
    for (const name of [...TABLE_ORDER].reverse()) {
      if (skipEphemeral && EPHEMERAL.has(name)) continue;
      if (!dump.tables[name]) continue;
      await client.query(
        `truncate table ${quoteIdent(name)} restart identity cascade`,
      );
      log(`wipe: truncated ${name}`);
    }
  }

  const imported = {};
  for (const name of TABLE_ORDER) {
    if (skipEphemeral && EPHEMERAL.has(name)) continue;
    const table = dump.tables[name];
    if (!table || !table.rows?.length) {
      imported[name] = 0;
      continue;
    }

    if (name === "schema_migrations" && !wipe) {
      let n = 0;
      for (const row of table.rows) {
        await client.query(
          `insert into schema_migrations (name, applied_at)
           values ($1, $2)
           on conflict (name) do nothing`,
          [row.name, normalizeValue(row.applied_at)],
        );
        n += 1;
      }
      imported[name] = n;
      log(`import: ${name} (${n} rows)`);
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
    ).rows.map((r) => r.name);

    let insertSql = `insert into ${quoteIdent(name)} (${colList}) values (${placeholders})`;
    if (pkCols.length && !wipe) {
      insertSql += ` on conflict (${pkCols.map(quoteIdent).join(", ")}) do nothing`;
    }

    let n = 0;
    for (const row of table.rows) {
      const values = cols.map((c) => normalizeValue(row[c]));
      await client.query(insertSql, values);
      n += 1;
    }
    imported[name] = n;
    log(`import: ${name} (${n} rows)`);
  }

  return imported;
}
