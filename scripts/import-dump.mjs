/**
 * Import a portable gift-registry dump into production Postgres.
 *
 * Prerequisites:
 *   - DATABASE_URL pointing at Postgres
 *   - Schema migrations already applied (npm run migrate)
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/import-dump.mjs
 *   DATABASE_URL=... node scripts/import-dump.mjs --in /path/to/dump.json
 *   DATABASE_URL=... node scripts/import-dump.mjs --wipe   # truncate app tables first
 *   DATABASE_URL=... node scripts/import-dump.mjs --skip-ephemeral
 *
 * Default dump path:
 *   /cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data/gift-registry-pglite-dump.json
 *
 * Does not publish the app — only loads data into the DB you point at.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const DEFAULT_IN = path.join(
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data",
  "gift-registry-pglite-dump.json",
);

/** Parents before children — must match export order. */
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
];

const EPHEMERAL = new Set(["sessions", "auth_rate_limits"]);

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && v.__type === "buffer") {
    return Buffer.from(v.base64, "base64");
  }
  return v;
}

async function main() {
  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  if (!url) {
    console.error(
      "DATABASE_URL is required. Point it at production (or staging) Postgres.",
    );
    process.exit(1);
  }

  const inPath = path.resolve(argValue("--in") || DEFAULT_IN);
  const wipe = hasFlag("--wipe");
  const skipEphemeral = hasFlag("--skip-ephemeral");

  const dump = JSON.parse(await readFile(inPath, "utf8"));
  if (dump.format !== "ace-mckilty-gift-registry-pglite-v1") {
    console.error("Unrecognized dump format:", dump.format);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const imported = {};
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '60s'");

    // Ensure migrations table exists; do not re-run DDL here.
    const mig = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );
    if (!mig.rowCount) {
      throw new Error(
        "Schema missing (no users table). Run: npm run migrate",
      );
    }

    if (wipe) {
      // Children first
      for (const name of [...TABLE_ORDER].reverse()) {
        if (skipEphemeral && EPHEMERAL.has(name)) continue;
        if (!dump.tables[name]) continue;
        await client.query(
          `truncate table ${quoteIdent(name)} restart identity cascade`,
        );
        console.log(`wipe: truncated ${name}`);
      }
    }

    for (const name of TABLE_ORDER) {
      if (skipEphemeral && EPHEMERAL.has(name)) continue;
      const table = dump.tables[name];
      if (!table || !table.rows?.length) {
        imported[name] = 0;
        continue;
      }

      // Skip schema_migrations rows that are already present
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
        continue;
      }

      const cols = table.columns.map((c) => c.name);
      const colList = cols.map(quoteIdent).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      // Prefer keep-existing on PK conflict so re-runs are safer without --wipe
      const pkCols = (
        await client.query(
          `select a.attname as name
           from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
           where i.indrelid = $1::regclass and i.indisprimary`,
          [name],
        )
      ).rows.map((r) => r.name);

      let sql = `insert into ${quoteIdent(name)} (${colList}) values (${placeholders})`;
      if (pkCols.length && !wipe) {
        sql += ` on conflict (${pkCols.map(quoteIdent).join(", ")}) do nothing`;
      }

      let n = 0;
      for (const row of table.rows) {
        const values = cols.map((c) => normalizeValue(row[c]));
        await client.query(sql, values);
        n += 1;
      }
      imported[name] = n;
      console.log(`import: ${name} (${n} rows)`);
    }

    await client.query("commit");
    console.log(
      JSON.stringify(
        {
          ok: true,
          from: inPath,
          wipe,
          skipEphemeral,
          imported,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await client.query("rollback");
    console.error("import failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
