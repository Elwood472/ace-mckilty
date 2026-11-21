import "server-only";

import type pg from "pg";
import { hashPassword } from "@/lib/password";

/**
 * Target accounts for one-shot password set — never hardcode emails in source.
 * Set BOOTSTRAP_EMAILS as a comma-separated list (lowercase) when needed.
 */
function bootstrapEmails(): string[] {
  return (process.env.BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/**
 * One-shot password set for imported accounts named in BOOTSTRAP_EMAILS.
 * Runs server-side (build script and first DB connect) when
 * BOOTSTRAP_PASSWORD is set and password_bootstrap_v2_lock is unset.
 * Never logs the password or email addresses. Not an HTTP route.
 */
export async function ensurePasswordBootstrap(
  client: pg.PoolClient,
): Promise<void> {
  // Hosted Postgres: never auto-reset passwords from env on connect.
  // Use forgot-password / admin tools instead; leave BOOTSTRAP_* unset in host env.
  if (process.env.DATABASE_URL?.trim()) return;

  const password = process.env.BOOTSTRAP_PASSWORD?.trim() ?? "";
  if (!password || password.length < 8) return;

  const emails = bootstrapEmails();
  if (emails.length === 0) return;

  await client.query(`
    create table if not exists password_bootstrap_v2_lock (
      id boolean primary key default true check (id),
      locked_at timestamptz not null default now()
    )
  `);

  const locked = await client.query(
    "select 1 from password_bootstrap_v2_lock limit 1",
  );
  if (locked.rowCount) return;

  const usersExist = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'users'`,
  );
  if (!usersExist.rowCount) return;

  const found = await client.query<{ email: string }>(
    `select lower(email) as email from users
     where lower(email) = any($1::text[])`,
    [emails],
  );
  const present = new Set(found.rows.map((r) => r.email));
  if (emails.some((e) => !present.has(e))) return;

  const hash = await hashPassword(password);
  await client.query("begin");
  try {
    for (const email of emails) {
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
    console.info(
      `[db] password bootstrap v2 applied for ${emails.length} accounts; locked`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
