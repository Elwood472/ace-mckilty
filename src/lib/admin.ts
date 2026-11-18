import "server-only";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getCurrentUser, ensureTwoFactorEnrolled } from "@/lib/session";
import type { User } from "@/lib/types";

/** Default operator; override/extend with ADMIN_EMAILS (comma-separated). */
const DEFAULT_ADMIN_EMAILS = ["bluesbrthr@gmail.com"];

export function adminEmailAllowlist(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const merged = fromEnv.length ? fromEnv : DEFAULT_ADMIN_EMAILS;
  return [...new Set(merged)];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailAllowlist().includes(email.trim().toLowerCase());
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  await ensureTwoFactorEnrolled(user.id);
  if (!isAdminEmail(user.email)) redirect("/dashboard");
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
