import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { absoluteAppUrl } from "@/lib/app-url";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";

const RESET_TTL_MIN = 60;

/** httpOnly cookie holding the raw reset token after the email link is opened. */
export const RESET_TOKEN_COOKIE = "gr_pw_reset";

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function passwordResetEmailBody(resetUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Reset your Ace McKilty password";
  const text =
    `Reset your Ace McKilty Gift Registry password using this link:\n\n` +
    `${resetUrl}\n\n` +
    `This link expires in ${RESET_TTL_MIN} minutes. If you did not ask for a reset, ignore this email.`;
  const safe = resetUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p>Reset your Ace McKilty Gift Registry password:</p>
      <p><a href="${safe}"
        style="display:inline-block;background:#000080;color:#fff;padding:10px 16px;text-decoration:none;font-weight:700">
        Choose a new password
      </a></p>
      <p style="color:#555;font-size:12px">Or paste this link:<br>${safe}</p>
      <p style="color:#555;font-size:12px">Expires in ${RESET_TTL_MIN} minutes.</p>
    </div>`;
  return { subject, text, html };
}

/**
 * Create a reset token and email the link when the account exists.
 * Always returns a generic ok for callers (no account enumeration).
 * stubResetUrl is only for local PGlite (no DATABASE_URL) stub mail.
 */
export async function requestPasswordReset(email: string): Promise<{
  stubResetUrl?: string;
}> {
  const normalized = email.trim().toLowerCase();
  const users = await sql<{ id: string }>(
    "select id from users where email = $1",
    [normalized],
  );
  const user = users[0];
  if (!user) return {};

  // Invalidate unused prior tokens for this user.
  await sql(
    `update password_reset_tokens
     set used_at = now()
     where user_id = $1 and used_at is null`,
    [user.id],
  );

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(raw);
  const id = nanoid(24);
  const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000).toISOString();
  await sql(
    `insert into password_reset_tokens (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4::timestamptz)`,
    [id, user.id, tokenHash, expiresAt],
  );

  // Email still uses ?token= once; middleware moves it into an httpOnly cookie
  // and redirects to a clean /login/reset URL before the form is shown.
  const resetUrl = absoluteAppUrl(`/login/reset?token=${encodeURIComponent(raw)}`);
  const mail = passwordResetEmailBody(resetUrl);
  const sent = await sendEmail({
    to: normalized,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  if (sent.ok && sent.mode === "stub" && !process.env.DATABASE_URL?.trim()) {
    return { stubResetUrl: resetUrl };
  }
  return {};
}

export async function readResetTokenCookie(): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(RESET_TOKEN_COOKIE)?.value;
  return typeof raw === "string" ? raw.trim() : "";
}

export async function clearResetTokenCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(RESET_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/login/reset",
    maxAge: 0,
  });
}

/**
 * Admin-only: create a reset token, email it, and always return the URL
 * so support can paste the link if mail is delayed.
 */
export async function adminIssuePasswordReset(userId: string): Promise<{
  resetUrl: string;
  email: string;
  sent: { ok: boolean; mode: string; error?: string };
}> {
  const users = await sql<{ id: string; email: string }>(
    "select id, email from users where id = $1",
    [userId],
  );
  const user = users[0];
  if (!user) throw new Error("NOT_FOUND");

  await sql(
    `update password_reset_tokens
     set used_at = now()
     where user_id = $1 and used_at is null`,
    [user.id],
  );

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(raw);
  const id = nanoid(24);
  const expiresAt = new Date(
    Date.now() + RESET_TTL_MIN * 60 * 1000,
  ).toISOString();
  await sql(
    `insert into password_reset_tokens (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4::timestamptz)`,
    [id, user.id, tokenHash, expiresAt],
  );

  const resetUrl = absoluteAppUrl(
    `/login/reset?token=${encodeURIComponent(raw)}`,
  );
  const mail = passwordResetEmailBody(resetUrl);
  const sent = await sendEmail({
    to: user.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return {
    resetUrl,
    email: user.email,
    sent: {
      ok: sent.ok,
      mode: sent.mode,
      error: sent.ok ? undefined : sent.error,
    },
  };
}

export type ResetTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
};

export async function findValidResetToken(
  rawToken: string,
): Promise<ResetTokenRow | null> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return null;
  const want = hashResetToken(rawToken);
  // Look up by scanning recent unused tokens for this hash (unique index).
  const rows = await sql<ResetTokenRow>(
    `select id, user_id, token_hash,
            expires_at::text as expires_at,
            used_at::text as used_at
     from password_reset_tokens
     where token_hash = $1
       and used_at is null
       and expires_at > now()`,
    [want],
  );
  const row = rows[0];
  if (!row) return null;
  if (!safeEqualHex(row.token_hash, want)) return null;
  return row;
}

export async function consumeResetTokenAndSetPassword(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await findValidResetToken(rawToken);
  if (!row) {
    return { ok: false, error: "This reset link is invalid or expired." };
  }
  if (newPassword.length < 8 || newPassword.length > 200) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const passwordHash = await hashPassword(newPassword);
  await sql(
    `update password_reset_tokens set used_at = now() where id = $1`,
    [row.id],
  );
  await sql(`update users set password_hash = $1 where id = $2`, [
    passwordHash,
    row.user_id,
  ]);
  // Sign out every device after a reset.
  await sql(`delete from sessions where user_id = $1`, [row.user_id]);
  // Drop any pending 2FA login challenges.
  await sql(`delete from auth_challenges where user_id = $1`, [row.user_id]);
  return { ok: true };
}
