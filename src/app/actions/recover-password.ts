"use server";

import { z } from "zod";
import { assertCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  getImportSecret,
  importSecretsEqual,
  isImportSecretConfigured,
} from "@/lib/dump-import";

export type RecoverPasswordState = { error?: string; ok?: string };

const NOT_AVAILABLE = "Unavailable.";
const GENERIC_FAIL = "Could not update password. Check the secret and email.";

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * One-shot recovery while IMPORT_SECRET is still bound: set a new password
 * for an existing account without knowing the old one. Remove IMPORT_SECRET
 * after Rick/Charli can sign in.
 */
export async function recoverPasswordAction(
  _prev: RecoverPasswordState,
  formData: FormData,
): Promise<RecoverPasswordState> {
  if (!isImportSecretConfigured()) {
    return { error: NOT_AVAILABLE };
  }

  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  const ip = await getClientIp();
  if (
    !(await checkRateLimit(`recover-pw-ip:${ip}`, {
      maxHits: 8,
      windowMs: 60 * 60 * 1000,
    }))
  ) {
    return { error: "Too many attempts. Try again later." };
  }
  if (
    !(await checkRateLimit("recover-pw-global", {
      maxHits: 30,
      windowMs: 60 * 60 * 1000,
    }))
  ) {
    return { error: "Too many attempts. Try again later." };
  }

  const provided = formString(formData, "importSecret");
  const expected = getImportSecret();
  if (!provided || !importSecretsEqual(provided, expected)) {
    return { error: GENERIC_FAIL };
  }

  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const confirm = formString(formData, "confirmPassword");
  const parsed = z
    .object({
      email: z.string().email().max(320),
      password: z.string().min(8).max(200),
    })
    .safeParse({ email, password });
  if (!parsed.success || password !== confirm) {
    return {
      error: "Enter a valid email and matching passwords (8+ characters).",
    };
  }

  try {
    const rows = await sql<{ id: string }>(
      "select id from users where email = $1",
      [email],
    );
    if (!rows.length) {
      return { error: GENERIC_FAIL };
    }
    const hash = await hashPassword(password);
    await sql("update users set password_hash = $1 where id = $2", [
      hash,
      rows[0].id,
    ]);
    await sql("delete from sessions where user_id = $1", [rows[0].id]);
    return {
      ok: "Password updated. Sign in with that email, then remove IMPORT_SECRET.",
    };
  } catch (e) {
    console.error("[recover-password] failed", e instanceof Error ? e.message : e);
    return { error: "Could not update password. Try again." };
  }
}
