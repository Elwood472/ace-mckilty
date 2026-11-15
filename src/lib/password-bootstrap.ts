import "server-only";

import type pg from "pg";
import { hashPassword } from "@/lib/password";

const BOOTSTRAP_EMAILS = ["bluesbrthr@gmail.com", "cmebray@gmail.com"] as const;

/**
 * One-shot password set for imported Rick/Charli accounts.
 * Runs server-side (build script and first DB connect) when
 * BOOTSTRAP_PASSWORD is set and password_bootstrap_v2_lock is unset.
 * Never logs the password. Not an HTTP route.
 */
export async function ensurePasswordBootstrap(
  client: pg.PoolClient,
): Promise<void> {
  const password = process.env.BOOTSTRAP_PASSWORD?.trim() ?? "";
  if (!password || password.length < 8) return;

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
    [BOOTSTRAP_EMAILS as unknown as string[]],
  );
  const emails = new Set(found.rows.map((r) => r.email));
  if (BOOTSTRAP_EMAILS.some((e) => !emails.has(e))) return;

  const hash = await hashPassword(password);
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
    console.info("[db] password bootstrap v2 applied for 2 accounts; locked");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
