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

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80).optional(),
});

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type AuthState = { error?: string };

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
    const displayName = formString(formData, "displayName");

    const parsed = credentials.safeParse({ email, password, displayName });
    if (!parsed.success || !displayName) {
      return {
        error: "Enter a valid email, name, and password (8+ characters).",
      };
    }

    // Cap account creation per IP and per email (bcrypt is expensive).
    // No low global cap — that lets one attacker block every new signup.
    if (
      !(await checkRateLimit(`signup-ip:${ip}`, {
        maxHits: 3,
        windowMs: 60 * 60 * 1000,
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
      `insert into users (email, password_hash, display_name)
       values ($1, $2, $3) returning id`,
      [email, passwordHash, displayName],
    );
    const { ensurePersonalList } = await import("@/lib/lists");
    await ensurePersonalList(rows[0].id, displayName);
    await createSession(rows[0].id);
    userId = rows[0].id;
  } catch (e) {
    console.error("[auth] signUp failed", e);
    return { error: "Could not create account. Try again in a moment." };
  }

  if (userId) redirect("/profile/security?setup=1");
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

    const rows = await sql<{ id: string; password_hash: string }>(
      "select id, password_hash from users where email = $1",
      [email],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await bumpCounter(failKey, SIGNIN_FAIL_WINDOW);
      return { error: "Email or password is incorrect." };
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
    console.error("[auth] signIn failed", e);
    return { error: "Could not sign in. Try again in a moment." };
  }

  if (needsTwoFactor) redirect("/login/verify");
  if (needsTwoFactorSetup) redirect("/profile/security?setup=1");
  if (ok) redirect(nextPath);
  return { error: "Could not sign in. Try again in a moment." };
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
