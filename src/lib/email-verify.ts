import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { absoluteAppUrl } from "@/lib/app-url";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const VERIFY_TTL_MIN = 60 * 24; // 24 hours

/** httpOnly cookie with raw verify token after the email link is opened. */
export const VERIFY_TOKEN_COOKIE = "gr_email_verify";
/** Remembers which address just signed up (for resend on check-email). */
export const PENDING_SIGNUP_EMAIL_COOKIE = "gr_signup_email";
const STUB_VERIFY_COOKIE = "gr_verify_stub";

export function hashVerifyToken(raw: string): string {
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

export function verifyEmailBody(verifyUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Confirm your Ace McKilty email";
  const text =
    `Confirm your Ace McKilty Gift Registry account with this link:\n\n` +
    `${verifyUrl}\n\n` +
    `This link expires in 24 hours. If you did not create an account, ignore this email.`;
  const safe = verifyUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <p>Confirm your Ace McKilty Gift Registry account:</p>
      <p><a href="${safe}"
        style="display:inline-block;background:#000080;color:#fff;padding:10px 16px;text-decoration:none;font-weight:700">
        Confirm email
      </a></p>
      <p style="color:#555;font-size:12px">Or paste this link:<br>${safe}</p>
      <p style="color:#555;font-size:12px">Expires in 24 hours.</p>
    </div>`;
  return { subject, text, html };
}

export async function issueEmailVerification(userId: string, email: string): Promise<{
  ok: boolean;
  error?: string;
  stubVerifyUrl?: string;
}> {
  const normalized = email.trim().toLowerCase();

  await sql(
    `update email_verify_tokens
     set used_at = now()
     where user_id = $1 and used_at is null`,
    [userId],
  );

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashVerifyToken(raw);
  const id = nanoid(24);
  const expiresAt = new Date(
    Date.now() + VERIFY_TTL_MIN * 60 * 1000,
  ).toISOString();
  await sql(
    `insert into email_verify_tokens (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4::timestamptz)`,
    [id, userId, tokenHash, expiresAt],
  );

  const verifyUrl = absoluteAppUrl(
    `/signup/verify?token=${encodeURIComponent(raw)}`,
  );
  const mail = verifyEmailBody(verifyUrl);
  const sent = await sendEmail({
    to: normalized,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error || "Could not send email." };
  }

  if (sent.mode === "stub" && !process.env.DATABASE_URL?.trim()) {
    return { ok: true, stubVerifyUrl: verifyUrl };
  }
  return { ok: true };
}

export async function confirmEmailVerification(
  rawToken: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) {
    return { ok: false, error: "This confirmation link is invalid or expired." };
  }
  const want = hashVerifyToken(rawToken);
  const rows = await sql<{
    id: string;
    user_id: string;
    token_hash: string;
  }>(
    `select id, user_id, token_hash
     from email_verify_tokens
     where token_hash = $1
       and used_at is null
       and expires_at > now()`,
    [want],
  );
  const row = rows[0];
  if (!row || !safeEqualHex(row.token_hash, want)) {
    return { ok: false, error: "This confirmation link is invalid or expired." };
  }

  await sql(`update email_verify_tokens set used_at = now() where id = $1`, [
    row.id,
  ]);
  await sql(
    `update users set email_verified_at = now() where id = $1 and email_verified_at is null`,
    [row.user_id],
  );
  // Drop any other unused verify tokens for this user.
  await sql(
    `update email_verify_tokens set used_at = now()
     where user_id = $1 and used_at is null`,
    [row.user_id],
  );

  return { ok: true, userId: row.user_id };
}

export async function setPendingSignupEmail(email: string): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_SIGNUP_EMAIL_COOKIE, email.trim().toLowerCase(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup",
    maxAge: 60 * 60 * 24,
  });
}

export async function readPendingSignupEmail(): Promise<string> {
  const jar = await cookies();
  return jar.get(PENDING_SIGNUP_EMAIL_COOKIE)?.value?.trim().toLowerCase() ?? "";
}

export async function clearPendingSignupEmail(): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_SIGNUP_EMAIL_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup",
    maxAge: 0,
  });
}

export async function setStubVerifyUrl(url: string): Promise<void> {
  const jar = await cookies();
  jar.set(STUB_VERIFY_COOKIE, url, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup/check-email",
    maxAge: 60 * 30,
  });
}

export async function readStubVerifyUrl(): Promise<string> {
  const jar = await cookies();
  return jar.get(STUB_VERIFY_COOKIE)?.value?.trim() ?? "";
}

export async function readVerifyTokenCookie(): Promise<string> {
  const jar = await cookies();
  return jar.get(VERIFY_TOKEN_COOKIE)?.value?.trim() ?? "";
}

export async function clearVerifyTokenCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(VERIFY_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup/verify",
    maxAge: 0,
  });
}

/** True when the account may sign in / use the app. */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const rows = await sql<{ email_verified_at: string | null }>(
    `select email_verified_at::text as email_verified_at from users where id = $1`,
    [userId],
  );
  return !!rows[0]?.email_verified_at;
}
