import "server-only";

import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  generateEmailOtp,
  hashEmailOtp,
  safeEqualHex,
  verifyTotpCode,
} from "@/lib/totp";

export const TWO_FACTOR_COOKIE = "gr_2fa";
const CHALLENGE_TTL_MIN = 10;
const EMAIL_CODE_TTL_MIN = 10;

export type TwoFactorFlags = {
  totp_enabled: boolean;
  email_2fa_enabled: boolean;
  totp_secret: string | null;
};

export function emailSendingConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

/** Hosted needs Resend; local PGlite can use stub codes. */
export function emailTwoFactorAvailable(): boolean {
  return emailSendingConfigured() || !process.env.DATABASE_URL?.trim();
}

export async function getUserTwoFactor(
  userId: string,
): Promise<TwoFactorFlags | null> {
  const rows = await sql<TwoFactorFlags>(
    `select totp_enabled, email_2fa_enabled, totp_secret
     from users where id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export function userNeedsTwoFactor(flags: TwoFactorFlags): boolean {
  return !!(flags.totp_enabled || flags.email_2fa_enabled);
}

async function setChallengeCookie(id: string): Promise<void> {
  const jar = await cookies();
  jar.set(TWO_FACTOR_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_MIN * 60,
  });
}

export async function clearChallengeCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(TWO_FACTOR_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * After password OK: create challenge, optionally email a code, set cookie.
 * Returns stubDevCode only when Resend is unset and DATABASE_URL is unset (local).
 */
export async function startLoginTwoFactor(opts: {
  userId: string;
  nextPath: string;
  email: string;
  flags: TwoFactorFlags;
}): Promise<{ stubDevCode?: string }> {
  const id = nanoid(32);
  let emailCodeHash: string | null = null;
  let stubDevCode: string | undefined;
  let emailSentAt: string | null = null;

  // Auto-email only when email is the sole 2FA method. If authenticator is
  // also on, users enter that code by default and can request email on demand.
  if (opts.flags.email_2fa_enabled && !opts.flags.totp_enabled) {
    const code = generateEmailOtp();
    emailCodeHash = hashEmailOtp(code);
    const sent = await sendEmail({
      to: opts.email,
      subject: "Your Ace McKilty sign-in code",
      text:
        `Your sign-in code is ${code}.\n\n` +
        `It expires in ${EMAIL_CODE_TTL_MIN} minutes. If you did not try to sign in, ignore this email.`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
          <p>Your Ace McKilty sign-in code:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
          <p style="color:#555;font-size:12px">Expires in ${EMAIL_CODE_TTL_MIN} minutes.</p>
        </div>`,
    });
    if (sent.ok) {
      emailSentAt = new Date().toISOString();
      if (sent.mode === "stub" && !process.env.DATABASE_URL?.trim()) {
        stubDevCode = code;
      }
    }
  }

  const expiresAt = new Date(
    Date.now() + CHALLENGE_TTL_MIN * 60 * 1000,
  ).toISOString();
  await sql(
    `insert into auth_challenges (id, user_id, next_path, email_code_hash, email_sent_at, expires_at)
     values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`,
    [id, opts.userId, opts.nextPath, emailCodeHash, emailSentAt, expiresAt],
  );
  await setChallengeCookie(id);
  return stubDevCode ? { stubDevCode } : {};
}

export type ChallengeRow = {
  id: string;
  user_id: string;
  next_path: string;
  email_code_hash: string | null;
  email_sent_at: string | null;
  expires_at: string;
  totp_enabled: boolean;
  email_2fa_enabled: boolean;
  totp_secret: string | null;
  email: string;
  display_name: string;
};

export async function getActiveChallenge(): Promise<ChallengeRow | null> {
  const jar = await cookies();
  const id = jar.get(TWO_FACTOR_COOKIE)?.value;
  if (!id) return null;
  const rows = await sql<ChallengeRow>(
    `select c.id, c.user_id, c.next_path, c.email_code_hash,
            c.email_sent_at::text as email_sent_at,
            c.expires_at::text as expires_at,
            u.totp_enabled, u.email_2fa_enabled, u.totp_secret,
            u.email, u.display_name
     from auth_challenges c
     join users u on u.id = c.user_id
     where c.id = $1 and c.expires_at > now()`,
    [id],
  );
  return rows[0] ?? null;
}

export async function deleteChallenge(id: string): Promise<void> {
  await sql("delete from auth_challenges where id = $1", [id]);
  await clearChallengeCookie();
}

export async function verifyLoginTwoFactorCode(
  challenge: ChallengeRow,
  code: string,
): Promise<boolean> {
  const cleaned = code.replace(/\s+/g, "");
  if (challenge.totp_enabled && challenge.totp_secret) {
    if (verifyTotpCode(challenge.totp_secret, cleaned)) return true;
  }
  if (challenge.email_2fa_enabled && challenge.email_code_hash) {
    const hash = hashEmailOtp(cleaned);
    if (safeEqualHex(hash, challenge.email_code_hash)) return true;
  }
  return false;
}

export async function resendLoginEmailCode(
  challenge: ChallengeRow,
): Promise<{ ok: true; stubDevCode?: string } | { ok: false; error: string }> {
  if (!challenge.email_2fa_enabled) {
    return { ok: false, error: "Email codes are not enabled for this account." };
  }
  const code = generateEmailOtp();
  const hash = hashEmailOtp(code);
  await sql(
    `update auth_challenges
     set email_code_hash = $1, email_sent_at = now()
     where id = $2`,
    [hash, challenge.id],
  );
  const sent = await sendEmail({
    to: challenge.email,
    subject: "Your Ace McKilty sign-in code",
    text:
      `Your sign-in code is ${code}.\n\n` +
      `It expires in ${EMAIL_CODE_TTL_MIN} minutes. If you did not try to sign in, ignore this email.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <p>Your Ace McKilty sign-in code:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
        <p style="color:#555;font-size:12px">Expires in ${EMAIL_CODE_TTL_MIN} minutes.</p>
      </div>`,
  });
  if (!sent.ok) {
    return { ok: false, error: "Could not send email. Try again." };
  }
  if (sent.mode === "stub" && !process.env.DATABASE_URL?.trim()) {
    return { ok: true, stubDevCode: code };
  }
  return { ok: true };
}
