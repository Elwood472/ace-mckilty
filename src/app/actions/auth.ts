"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { createSession, destroySession } from "@/lib/session";

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

  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const displayName = formString(formData, "displayName");

  const parsed = credentials.safeParse({ email, password, displayName });
  if (!parsed.success || !displayName) {
    return { error: "Enter a valid email, name, and password (8+ characters)." };
  }

  if (!(await checkRateLimit(`signup:${email}`))) {
    return { error: "Too many attempts. Try again later." };
  }

  const existing = await sql("select 1 from users where email = $1", [email]);
  if (existing.length) return { error: "An account with that email already exists." };

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

  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const parsed = credentials.safeParse({ email, password });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  if (!(await checkRateLimit(`signin:${email}`))) {
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
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
