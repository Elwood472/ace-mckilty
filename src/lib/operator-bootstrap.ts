import "server-only";

import type pg from "pg";

function adminEmailsFromEnv(): string[] {
  return [
    ...new Set(
      (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
}

/**
 * One-shot: promote existing users whose email is in ADMIN_EMAILS to
 * is_operator, then lock so later signups/imports are not auto-elevated.
 * Does not create accounts (open signup must not squat allowlisted emails).
 * Safe to run on hosted Postgres — no passwords are set from env.
 */
export async function ensureOperatorGrants(
  client: pg.PoolClient,
): Promise<void> {
  const emails = adminEmailsFromEnv();
  if (emails.length === 0) return;

  await client.query(`
    create table if not exists admin_operator_grant_lock (
      id boolean primary key default true check (id),
      locked_at timestamptz not null default now()
    )
  `);

  const locked = await client.query(
    "select 1 from admin_operator_grant_lock limit 1",
  );
  if (locked.rowCount) return;

  const usersExist = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'users'`,
  );
  if (!usersExist.rowCount) return;

  const col = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users'
       and column_name = 'is_operator'`,
  );
  if (!col.rowCount) return;

  await client.query("begin");
  try {
    const updated = await client.query(
      `update users
       set is_operator = true
       where lower(email) = any($1::text[])
         and is_operator = false`,
      [emails],
    );

    const operators = await client.query(
      `select 1 from users
       where is_operator = true
         and lower(email) = any($1::text[])
       limit 1`,
      [emails],
    );

    // Lock only once at least one allowlisted operator exists.
    // Empty DBs stay unlocked so a later import can still be promoted once.
    if (operators.rowCount) {
      await client.query(
        `insert into admin_operator_grant_lock (id, locked_at) values (true, now())
         on conflict (id) do nothing`,
      );
      console.info(
        `[db] operator grant applied for ${updated.rowCount ?? 0} account(s); locked`,
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
