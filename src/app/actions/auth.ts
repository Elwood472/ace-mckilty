"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { createSession, destroySession } from "@/lib/session";
import { safeInternalPath } from "@/lib/urls";
import { getClientIp } from "@/lib/client-ip";
import { assertHuman } from "@/lib/captcha";

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
        maxHits: 5,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }
    if (
      !(await checkRateLimit(`signup:${email}`, {
        maxHits: 5,
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
    redirect("/dashboard");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[auth] signUp failed", e);
    return { error: "Could not create account. Try again in a moment." };
  }
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

  try {
    const ip = await getClientIp();
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
      return { error: "Email or password is incorrect." };
    }

    await createSession(user.id);
    const named = await sql<{ display_name: string }>(
      "select display_name from users where id = $1",
      [user.id],
    );
    const { ensurePersonalList } = await import("@/lib/lists");
    await ensurePersonalList(user.id, named[0]?.display_name ?? "My");
    const next = formString(formData, "next");
    redirect(safeInternalPath(next));
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[auth] signIn failed", e);
    return { error: "Could not sign in. Try again in a moment." };
  }
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
