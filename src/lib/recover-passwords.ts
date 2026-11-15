import "server-only";

import { sql } from "@/lib/db";
import { isImportSecretConfigured } from "@/lib/dump-import";

/** Only these imported accounts may be reset via IMPORT_SECRET recovery. */
export const RECOVERABLE_EMAILS = [
  "bluesbrthr@gmail.com",
  "cmebray@gmail.com",
] as const;

export type RecoverableEmail = (typeof RECOVERABLE_EMAILS)[number];

export function isRecoverableEmail(email: string): email is RecoverableEmail {
  const normalized = email.trim().toLowerCase();
  return (RECOVERABLE_EMAILS as readonly string[]).includes(normalized);
}

async function ensureRecoverTables(): Promise<void> {
  await sql(`
    create table if not exists recover_password_lock (
      id boolean primary key default true check (id),
      locked_at timestamptz not null default now()
    )
  `);
  await sql(`
    create table if not exists recover_password_resets (
      email text primary key,
      reset_at timestamptz not null default now()
    )
  `);
}

export async function isRecoverPasswordLocked(): Promise<boolean> {
  await ensureRecoverTables();
  const rows = await sql("select 1 from recover_password_lock limit 1");
  return rows.length > 0;
}

export async function lockRecoverPasswords(): Promise<void> {
  await ensureRecoverTables();
  await sql(
    `insert into recover_password_lock (id, locked_at) values (true, now())
     on conflict (id) do nothing`,
  );
}

export async function markRecoverPasswordReset(email: string): Promise<void> {
  await ensureRecoverTables();
  await sql(
    `insert into recover_password_resets (email, reset_at) values ($1, now())
     on conflict (email) do update set reset_at = now()`,
    [email.trim().toLowerCase()],
  );
}

export async function listRecoverPasswordResets(): Promise<string[]> {
  await ensureRecoverTables();
  const rows = await sql<{ email: string }>(
    "select email from recover_password_resets",
  );
  return rows.map((r) => r.email.toLowerCase());
}

export async function bothRecoverablePasswordsSet(): Promise<boolean> {
  const done = new Set(await listRecoverPasswordResets());
  return RECOVERABLE_EMAILS.every((email) => done.has(email));
}

/** Signed-in operator may use recovery while secret is set and not locked. */
export async function canUseRecoverPasswords(
  sessionUserId: string | undefined,
): Promise<boolean> {
  if (!sessionUserId || !isImportSecretConfigured()) return false;
  if (await isRecoverPasswordLocked()) return false;
  return true;
}
