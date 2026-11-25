"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { assertCsrf } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { checkClientIpRateLimit } from "@/lib/client-ip";
import { verifyPassword } from "@/lib/password";
import { createSession, requireUser } from "@/lib/session";
import { generateTotpSecret, totpUri, verifyTotpCode } from "@/lib/totp";
import {
  deleteChallenge,
  emailTwoFactorAvailable,
  getActiveChallenge,
  resendLoginEmailCode,
  verifyLoginTwoFactorCode,
} from "@/lib/two-factor";
import { safeInternalPath } from "@/lib/url-safety";

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type TwoFactorState = {
  error?: string;
  ok?: string;
  stubDevCode?: string;
  qrDataUrl?: string;
  secret?: string;
};

export async function verifyTwoFactorLogin(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  let nextPath = "/dashboard";
  let ok = false;
  try {
    if (
      !(await checkClientIpRateLimit("2fa-verify", {
        maxHits: 20,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }

    const challenge = await getActiveChallenge();
    if (!challenge) {
      return { error: "Sign-in expired. Start again from the login page." };
    }

    const code = formString(formData, "code");
    if (!(await verifyLoginTwoFactorCode(challenge, code))) {
      return { error: "That code is incorrect or expired." };
    }

    await deleteChallenge(challenge.id);
    await createSession(challenge.user_id);
    const named = await sql<{ display_name: string }>(
      "select display_name from users where id = $1",
      [challenge.user_id],
    );
    const { ensurePersonalList } = await import("@/lib/lists");
    await ensurePersonalList(
      challenge.user_id,
      named[0]?.display_name ?? "My",
    );
    // Re-validate even though login sanitized on write — DB value must not
    // become an open redirect after 2FA.
    nextPath = safeInternalPath(challenge.next_path, "/dashboard");
    ok = true;
  } catch (e) {
    console.error("[2fa] verify login failed", e);
    return { error: "Could not verify. Try again." };
  }

  if (ok) redirect(nextPath);
  return { error: "Could not verify. Try again." };
}

export async function resendTwoFactorEmail(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  try {
    if (
      !(await checkClientIpRateLimit("2fa-resend", {
        maxHits: 5,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many resend attempts. Try again later." };
    }
    const challenge = await getActiveChallenge();
    if (!challenge) {
      return { error: "Sign-in expired. Start again from the login page." };
    }
    const result = await resendLoginEmailCode(challenge);
    if (!result.ok) return { error: result.error };
    return {
      ok: "A new code was sent to your email.",
      stubDevCode: result.stubDevCode,
    };
  } catch (e) {
    console.error("[2fa] resend failed", e);
    return { error: "Could not resend. Try again." };
  }
}

async function assertCurrentPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  const rows = await sql<{ password_hash: string }>(
    "select password_hash from users where id = $1",
    [userId],
  );
  if (!rows[0]) return false;
  return verifyPassword(password, rows[0].password_hash);
}

export async function enableEmailTwoFactor(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  let goHome = false;
  try {
    const user = await requireUser({ skipTwoFactorCheck: true });
    if (!emailTwoFactorAvailable()) {
      return {
        error:
          "Email codes need RESEND_API_KEY bound before you can turn this on.",
      };
    }
    const password = formString(formData, "password");
    if (!(await assertCurrentPassword(user.id, password))) {
      return { error: "Password is incorrect." };
    }
    const before = await sql<{
      totp_enabled: boolean;
      email_2fa_enabled: boolean;
    }>(
      "select totp_enabled, email_2fa_enabled from users where id = $1",
      [user.id],
    );
    const firstMethod =
      !before[0]?.totp_enabled && !before[0]?.email_2fa_enabled;
    await sql(
      `update users set email_2fa_enabled = true where id = $1`,
      [user.id],
    );
    if (firstMethod) goHome = true;
    else return { ok: "Success — email sign-in codes are turned on." };
  } catch {
    return { error: "Could not update two-factor settings." };
  }
  if (goHome) redirect("/profile/security?ok=email");
  return { error: "Could not update two-factor settings." };
}

export async function disableEmailTwoFactor(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  try {
    const user = await requireUser({ skipTwoFactorCheck: true });
    const password = formString(formData, "password");
    if (!(await assertCurrentPassword(user.id, password))) {
      return { error: "Password is incorrect." };
    }
    const flags = await sql<{ totp_enabled: boolean }>(
      "select totp_enabled from users where id = $1",
      [user.id],
    );
    if (!flags[0]?.totp_enabled) {
      return {
        error:
          "Keep at least one two-factor method on. Turn on an authenticator first, or leave email codes enabled.",
      };
    }
    await sql(
      `update users set email_2fa_enabled = false where id = $1`,
      [user.id],
    );
    return { ok: "Email sign-in codes are off." };
  } catch {
    return { error: "Could not update two-factor settings." };
  }
}

export async function beginTotpSetup(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  try {
    const user = await requireUser({ skipTwoFactorCheck: true });
    const password = formString(formData, "password");
    if (!(await assertCurrentPassword(user.id, password))) {
      return { error: "Password is incorrect." };
    }
    const secret = generateTotpSecret();
    await sql(
      `insert into totp_setup (user_id, secret, created_at)
       values ($1, $2, now())
       on conflict (user_id) do update set secret = $2, created_at = now()`,
      [user.id, secret],
    );
    const uri = totpUri({ secret, accountName: user.email });
    const qrDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 200,
    });
    return { ok: "Scan the QR code, then enter a code to confirm.", qrDataUrl, secret };
  } catch (e) {
    console.error("[2fa] begin totp failed", e);
    return { error: "Could not start authenticator setup." };
  }
}

export async function confirmTotpSetup(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  let goHome = false;
  try {
    const user = await requireUser({ skipTwoFactorCheck: true });
    const code = formString(formData, "code");
    const rows = await sql<{ secret: string }>(
      "select secret from totp_setup where user_id = $1",
      [user.id],
    );
    const secret = rows[0]?.secret;
    if (!secret) {
      return { error: "Start authenticator setup again." };
    }
    if (!verifyTotpCode(secret, code)) {
      return { error: "That authenticator code is incorrect. Try again." };
    }
    const before = await sql<{
      totp_enabled: boolean;
      email_2fa_enabled: boolean;
    }>(
      "select totp_enabled, email_2fa_enabled from users where id = $1",
      [user.id],
    );
    const firstMethod =
      !before[0]?.totp_enabled && !before[0]?.email_2fa_enabled;
    await sql(
      `update users
       set totp_secret = $1, totp_enabled = true
       where id = $2`,
      [secret, user.id],
    );
    await sql("delete from totp_setup where user_id = $1", [user.id]);
    if (firstMethod) goHome = true;
    else
      return {
        ok: "Success — your authenticator app is set up and turned on.",
      };
  } catch {
    return { error: "Could not confirm authenticator." };
  }
  if (goHome) redirect("/profile/security?ok=authenticator");
  return { error: "Could not confirm authenticator." };
}

export async function disableTotp(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  try {
    const user = await requireUser({ skipTwoFactorCheck: true });
    const password = formString(formData, "password");
    if (!(await assertCurrentPassword(user.id, password))) {
      return { error: "Password is incorrect." };
    }
    const flags = await sql<{ email_2fa_enabled: boolean }>(
      "select email_2fa_enabled from users where id = $1",
      [user.id],
    );
    if (!flags[0]?.email_2fa_enabled) {
      return {
        error:
          "Keep at least one two-factor method on. Turn on email codes first, or leave the authenticator enabled.",
      };
    }
    await sql(
      `update users
       set totp_enabled = false, totp_secret = null
       where id = $1`,
      [user.id],
    );
    await sql("delete from totp_setup where user_id = $1", [user.id]);
    return { ok: "Authenticator app is off." };
  } catch {
    return { error: "Could not update authenticator settings." };
  }
}
