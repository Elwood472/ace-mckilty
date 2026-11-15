/**
 * Import a portable gift-registry dump into Postgres.
 *
 * Prerequisites:
 *   - DATABASE_URL pointing at Postgres
 *   - Schema migrations already applied (npm run migrate)
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/import-dump.mjs --in /path/to/dump.json
 *   DATABASE_URL=... node scripts/import-dump.mjs --wipe
 *   DATABASE_URL=... node scripts/import-dump.mjs --skip-ephemeral
 *   DATABASE_URL=... node scripts/import-dump.mjs --require-empty
 *
 * Default dump path (local/store only — not shipped in the public app):
 *   /cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data/gift-registry-pglite-dump.json
 *
 * Logs table row counts only — never emails, hashes, or other PII.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { importDumpWithClient } from "./lib/dump-import-core.mjs";

const DEFAULT_IN = path.join(
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/data",
  "gift-registry-pglite-dump.json",
);

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
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
  const requireEmpty = hasFlag("--require-empty");

  const dump = JSON.parse(await readFile(inPath, "utf8"));

  let conn = url;
  const local =
    /localhost|127\.0\.0\.1/i.test(conn) || conn.includes("sslmode=disable");
  if (!local && !/[?&]sslmode=/i.test(conn)) {
    conn += (conn.includes("?") ? "&" : "?") + "sslmode=verify-full";
  }
  const client = new pg.Client({ connectionString: conn });
  await client.connect();

  try {
    await client.query("begin");
    const imported = await importDumpWithClient(client, dump, {
      wipe,
      skipEphemeral,
      requireEmpty,
      log: (msg) => console.log(msg),
    });
    await client.query("commit");
    console.log(
      JSON.stringify(
        {
          ok: true,
          wipe,
          skipEphemeral,
          requireEmpty,
          imported,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await client.query("rollback");
    const msg = e instanceof Error ? e.message : String(e);
    console.error("import failed:", msg);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
