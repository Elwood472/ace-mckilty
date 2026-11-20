import "server-only";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getCurrentUser, ensureTwoFactorEnrolled } from "@/lib/session";
import type { User } from "@/lib/types";

/**
 * Operator emails from ADMIN_EMAILS (comma-separated).
 * No shipped default — if unset, nobody has admin access.
 * Bind ADMIN_EMAILS as an app secret for the published host.
 *
 * Email allowlist alone is not enough: the user row must also have
 * is_operator=true (one-shot grant for existing accounts via operator bootstrap).
 * Open signup rejects ADMIN_EMAILS so those addresses cannot be squatted.
 */
export function adminEmailAllowlist(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(fromEnv)];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = adminEmailAllowlist();
  if (allow.length === 0) return false;
  return allow.includes(email.trim().toLowerCase());
}

/** True only when allowlisted and explicitly provisioned as an operator. */
export function isProvisionedAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return !!user.is_operator && isAdminEmail(user.email);
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  await ensureTwoFactorEnrolled(user.id);
  if (!isProvisionedAdmin(user)) redirect("/dashboard");
  return user;
}

export async function writeAdminAudit(opts: {
  actorId: string;
  action: string;
  targetUserId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await sql(
    `insert into admin_audit_log (actor_id, action, target_user_id, detail)
     values ($1, $2, $3, $4::jsonb)`,
    [
      opts.actorId,
      opts.action,
      opts.targetUserId ?? null,
      JSON.stringify(opts.detail ?? {}),
    ],
  );
}
