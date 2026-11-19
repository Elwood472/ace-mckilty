/**
 * One-shot CLI password set for imported accounts.
 * When BOOTSTRAP_PASSWORD + BOOTSTRAP_EMAILS are set,
 * password_bootstrap_v2_lock is unset, and BOOTSTRAP_CONFIRM=YES,
 * sets that password for those accounts, then locks forever.
 *
 * Never runs against a production/hosted DATABASE_URL unless
 * BOOTSTRAP_ALLOW_HOSTED=1 is also set. Never an HTTP route.
 * Never logs the password or email values.
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const BOOTSTRAP_EMAILS = (process.env.BOOTSTRAP_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.includes("@"));
const password = process.env.BOOTSTRAP_PASSWORD?.trim() ?? "";
const url =
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";
const confirmed = process.env.BOOTSTRAP_CONFIRM?.trim() === "YES";
const allowHosted = process.env.BOOTSTRAP_ALLOW_HOSTED?.trim() === "1";
const hostedLike =
  process.env.NODE_ENV === "production" ||
  /apps\.grok\.bot|neon\.tech|amazonaws\.com|supabase\.co/i.test(url);

if (!url) {
  console.log("bootstrap-passwords: no DATABASE_URL — skip");
  process.exit(0);
}
if (!password) {
  console.log("bootstrap-passwords: BOOTSTRAP_PASSWORD unset — skip");
  process.exit(0);
}
if (password.length < 8) {
  console.error("bootstrap-passwords: BOOTSTRAP_PASSWORD must be 8+ characters");
  process.exit(1);
}
if (BOOTSTRAP_EMAILS.length === 0) {
  console.log("bootstrap-passwords: BOOTSTRAP_EMAILS unset — skip");
  process.exit(0);
}
if (!confirmed) {
  console.error(
    "bootstrap-passwords: refused — set BOOTSTRAP_CONFIRM=YES to overwrite passwords",
  );
  process.exit(1);
}
if (hostedLike && !allowHosted) {
  console.error(
    "bootstrap-passwords: refused — looks like a hosted/production database; set BOOTSTRAP_ALLOW_HOSTED=1 only if intentional",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 15_000,
});
await client.connect();
try {
  await client.query("set lock_timeout = '30s'");
  await client.query("select pg_advisory_lock(7272743)");
  try {
    await client.query(`
      create table if not exists password_bootstrap_v2_lock (
        id boolean primary key default true check (id),
        locked_at timestamptz not null default now()
      )
    `);

    const locked = await client.query(
      "select 1 from password_bootstrap_v2_lock limit 1",
    );
    if (locked.rowCount) {
      console.log("bootstrap-passwords: already locked — skip");
      process.exit(0);
    }

    const usersExist = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'users'`,
    );
    if (!usersExist.rowCount) {
      console.log("bootstrap-passwords: users table missing — skip");
      process.exit(0);
    }

    const found = await client.query(
      `select lower(email) as email from users
       where lower(email) = any($1::text[])`,
      [BOOTSTRAP_EMAILS],
    );
    const emails = new Set(found.rows.map((r) => r.email));
    const missing = BOOTSTRAP_EMAILS.filter((e) => !emails.has(e));
    if (missing.length) {
      console.log(
        "bootstrap-passwords: target accounts not present yet — skip",
      );
      process.exit(0);
    }

    const hash = await bcrypt.hash(password, 12);
    await client.query("begin");
    try {
      for (const email of BOOTSTRAP_EMAILS) {
        await client.query(
          `update users set password_hash = $1 where lower(email) = $2`,
          [hash, email],
        );
        await client.query(
          `delete from sessions where user_id in (
             select id from users where lower(email) = $1
           )`,
          [email],
        );
      }
      await client.query(
        `insert into password_bootstrap_v2_lock (id, locked_at) values (true, now())
         on conflict (id) do nothing`,
      );
      await client.query("commit");
      console.log(
        `bootstrap-passwords: updated ${BOOTSTRAP_EMAILS.length} accounts and set permanent lock`,
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.query("select pg_advisory_unlock(7272743)").catch(() => {});
  }
} finally {
  await client.end();
}
