/**
 * Export durable local PGlite data to a portable JSON dump.
 *
 * Usage:
 *   node scripts/export-pglite.mjs
 *   node scripts/export-pglite.mjs --out /path/to/dump.json
 *
 * Default out:
 *   /cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data/gift-registry-pglite-dump.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_OUT = path.join(
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data",
  "gift-registry-pglite-dump.json",
);

/** Insert order respecting FKs (parents before children). */
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
  // ephemeral — included for completeness, import can skip
  "auth_rate_limits",
];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function serializeValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(v)) {
    return { __type: "buffer", base64: v.toString("base64") };
  }
  // PGlite may return numeric as string already
  return v;
}

async function exportDump(outPath) {
  const dataDir = path.join(ROOT, ".data", "pglite");
  const db = new PGlite(dataDir);
  await db.waitReady;

  const existing = new Set(
    (
      await db.query(
        `select tablename from pg_tables where schemaname = 'public'`,
      )
    ).rows.map((r) => r.tablename),
  );

  const tables = {};
  const counts = {};

  for (const name of TABLE_ORDER) {
    if (!existing.has(name)) continue;
    const cols = (
      await db.query(
        `select column_name, data_type, udt_name
         from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position`,
        [name],
      )
    ).rows;
    const colNames = cols.map((c) => c.column_name);
    const result = await db.query(`select * from ${name}`);
    const rows = result.rows.map((row) => {
      const out = {};
      for (const c of colNames) {
        out[c] = serializeValue(row[c]);
      }
      return out;
    });
    tables[name] = {
      columns: cols.map((c) => ({
        name: c.column_name,
        dataType: c.data_type,
        udtName: c.udt_name,
      })),
      rows,
    };
    counts[name] = rows.length;
  }

  await db.close();

  const dump = {
    format: "ace-mckilty-gift-registry-pglite-v1",
    exportedAt: new Date().toISOString(),
    source: "pglite",
    dataDir: ".data/pglite",
    tableOrder: TABLE_ORDER.filter((t) => tables[t]),
    counts,
    tables,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(dump, null, 2), "utf8");
  return { outPath, counts, tableCount: Object.keys(tables).length };
}

const out = argValue("--out") || DEFAULT_OUT;
const result = await exportDump(path.resolve(out));
console.log(
  JSON.stringify(
    {
      ok: true,
      out: result.outPath,
      tables: result.tableCount,
      counts: result.counts,
    },
    null,
    2,
  ),
);
