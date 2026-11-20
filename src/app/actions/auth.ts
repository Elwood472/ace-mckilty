"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { bumpCounter, checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { createSession, destroySession } from "@/lib/session";
import { safeInternalPath } from "@/lib/url-safety";
import { getClientIp } from "@/lib/client-ip";
import { assertHuman } from "@/lib/captcha";
import { SIGNIN_FAIL_WINDOW, signInFailKey } from "@/lib/login-captcha";
import { DISPLAY_NAME_MAX, sanitizePublicLabel } from "@/lib/text";
import { isAdminEmail } from "@/lib/admin";
import {
  issueEmailVerification,
  setPendingSignupEmail,
  setStubVerifyUrl,
} from "@/lib/email-verify";

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX).optional(),
});

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type AuthState = { error?: string; ok?: string };

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  let userId: string | null = null;
  try {
    const ip = await getClientIp();
    const human = await assertHuman(formData, ip);
    if (!human.ok) return { error: human.error };
    const email = formString(formData, "email").toLowerCase();
    const password = formString(formData, "password");
    const displayName = sanitizePublicLabel(
      formString(formData, "displayName"),
      DISPLAY_NAME_MAX,
    );

    const parsed = credentials.safeParse({ email, password, displayName });
    if (!parsed.success || !displayName) {
      return {
        error: "Enter a valid email, name, and password (8+ characters).",
      };
    }

    // Cap account creation per IP (hourly + daily) and per email.
    // CAPTCHA/Turnstile already required via assertHuman above.
    if (
      !(await checkRateLimit(`signup-ip:${ip}`, {
        maxHits: 3,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }
    if (
      !(await checkRateLimit(`signup-ip-day:${ip}`, {
        maxHits: 6,
        windowMs: 24 * 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }
    if (
      !(await checkRateLimit(`signup:${email}`, {
        maxHits: 3,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }

    // Operator emails cannot be self-registered (prevents allowlist squatting).
    // Promote operators via ADMIN_EMAILS one-shot bootstrap / import instead.
    if (isAdminEmail(email)) {
      await hashPassword(password);
      return {
        error:
          "Could not create account. Try signing in, or use a different email.",
      };
    }

    const existing = await sql("select 1 from users where email = $1", [email]);
    if (existing.length) {
      // Avoid account-enumeration: same message as other soft failures.
      await hashPassword(password);
      return {
        error:
          "Could not create account. Try signing in, or use a different email.",
      };
    }

    const passwordHash = await hashPassword(password);
    const rows = await sql<{ id: string }>(
      `insert into users (email, password_hash, display_name, is_operator)
       values ($1, $2, $3, false) returning id`,
      [email, passwordHash, displayName],
    );
    userId = rows[0].id;

    const mailed = await issueEmailVerification(userId, email);
    if (!mailed.ok) {
      // Hosted without working mail: do not leave an unverified squat account.
      await sql(`delete from users where id = $1`, [userId]);
      userId = null;
      return {
        error:
          mailed.error ||
          "Could not send confirmation email. Try again later.",
      };
    }

    const { ensurePersonalList } = await import("@/lib/lists");
    await ensurePersonalList(userId, displayName);
    await setPendingSignupEmail(email);
    if (mailed.stubVerifyUrl) {
      await setStubVerifyUrl(mailed.stubVerifyUrl);
    }
  } catch (e) {
    console.error("[auth] signUp failed", e);
    return { error: "Could not create account. Try again in a moment." };
  }

  if (userId) redirect("/signup/check-email");
  return { error: "Could not create account. Try again in a moment." };
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  let nextPath = "/dashboard";
  let ok = false;
  let needsTwoFactor = false;
  let needsTwoFactorSetup = false;
  try {
    const ip = await getClientIp();
    const failKey = signInFailKey(ip);
    // Always require a human check on login (same bar as signup / reset).
    const human = await assertHuman(formData, ip);
    if (!human.ok) return { error: human.error };

    const email = formString(formData, "email").toLowerCase();
    const password = formString(formData, "password");
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      return { error: "Enter a valid email and password." };
    }

    // Rate-limit by IP (and IP+email), never by email alone — otherwise an
    // attacker who knows an address can lock the real owner out.
    if (
      !(await checkRateLimit(`signin-ip:${ip}`, {
        maxHits: 30,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }
    if (
      !(await checkRateLimit(`signin-ip-email:${ip}:${email}`, {
        maxHits: 12,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }

    const rows = await sql<{
      id: string;
      password_hash: string;
      email_verified_at: string | null;
    }>(
      `select id, password_hash,
              email_verified_at::text as email_verified_at
       from users where email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await bumpCounter(failKey, SIGNIN_FAIL_WINDOW);
      return { error: "Email or password is incorrect." };
    }

    if (!user.email_verified_at) {
      await setPendingSignupEmail(email);
      const mailed = await issueEmailVerification(user.id, email);
      if (mailed.stubVerifyUrl) {
        await setStubVerifyUrl(mailed.stubVerifyUrl);
      }
      redirect("/signup/check-email");
    }

    await clearRateLimit(failKey);
    nextPath = safeInternalPath(formString(formData, "next"));

    const {
      getUserTwoFactor,
      startLoginTwoFactor,
      userNeedsTwoFactor,
    } = await import("@/lib/two-factor");
    const flags = await getUserTwoFactor(user.id);
    if (flags && userNeedsTwoFactor(flags)) {
      const emailRow = await sql<{ email: string }>(
        "select email from users where id = $1",
        [user.id],
      );
      await startLoginTwoFactor({
        userId: user.id,
        nextPath,
        email: emailRow[0]?.email ?? email,
        flags,
      });
      needsTwoFactor = true;
    } else {
      // Password ok but no 2FA enrolled yet — session then mandatory setup.
      await createSession(user.id);
      const named = await sql<{ display_name: string }>(
        "select display_name from users where id = $1",
        [user.id],
      );
      const { ensurePersonalList } = await import("@/lib/lists");
      await ensurePersonalList(user.id, named[0]?.display_name ?? "My");
      needsTwoFactorSetup = true;
    }
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest?: string }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    console.error("[auth] signIn failed", e);
    return { error: "Could not sign in. Try again in a moment." };
  }

  if (needsTwoFactor) redirect("/login/verify");
  if (needsTwoFactorSetup) redirect("/profile/security?setup=1");
  if (ok) redirect(nextPath);
  return { error: "Could not sign in. Try again in a moment." };
}

/** Resend signup confirmation — same generic copy whether or not the address exists. */
export async function resendSignupVerificationAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  try {
    const ip = await getClientIp();
    if (
      !(await checkRateLimit(`verify-resend-ip:${ip}`, {
        maxHits: 5,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }

    const email = formString(formData, "email").toLowerCase();
    const parsed = z.string().email().max(320).safeParse(email);
    if (!parsed.success) {
      return { error: "Enter a valid email." };
    }

    if (
      !(await checkRateLimit(`verify-resend-email:${email}`, {
        maxHits: 3,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return {
        ok: "If that address still needs confirming, we sent another link.",
      };
    }

    const rows = await sql<{ id: string; email_verified_at: string | null }>(
      `select id, email_verified_at::text as email_verified_at
       from users where email = $1`,
      [email],
    );
    const user = rows[0];
    if (user && !user.email_verified_at) {
      const mailed = await issueEmailVerification(user.id, email);
      if (mailed.stubVerifyUrl) {
        await setStubVerifyUrl(mailed.stubVerifyUrl);
      }
      await setPendingSignupEmail(email);
      if (!mailed.ok) {
        return {
          error:
            mailed.error ||
            "Could not send confirmation email. Try again later.",
        };
      }
    }

    return {
      ok: "If that address still needs confirming, we sent another link.",
    };
  } catch (e) {
    console.error("[auth] resend verification failed", e);
    return { error: "Could not send email. Try again in a moment." };
  }
}

export async function signOut(formData?: FormData): Promise<void> {
  try {
    if (formData) {
      await assertCsrf(formData.get("csrf"));
    } else {
      throw new Error("INVALID_CSRF");
    }
  } catch {
    redirect("/");
  }
  await destroySession();
  redirect("/");
}
