"use server";

import { z } from "zod";
import { assertCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";
import {
  getImportSecret,
  importSecretsEqual,
  isImportSecretConfigured,
} from "@/lib/dump-import";
import {
  bothRecoverablePasswordsSet,
  canUseRecoverPasswords,
  isRecoverableEmail,
  lockRecoverPasswords,
  markRecoverPasswordReset,
} from "@/lib/recover-passwords";

export type RecoverPasswordState = { error?: string; ok?: string };

const NOT_AVAILABLE = "Unavailable.";
const GENERIC_FAIL = "Could not update password. Check the secret and email.";

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Post-import password set for allowlisted accounts only.
 * Requires signed-in session + IMPORT_SECRET. Remove the secret when done.
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

  const user = await getCurrentUser();
  if (!user || !(await canUseRecoverPasswords(user.id))) {
    return { error: "Sign in required." };
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
    !(await checkRateLimit(`recover-pw-user:${user.id}`, {
      maxHits: 10,
      windowMs: 60 * 60 * 1000,
    }))
  ) {
    return { error: "Too many attempts. Try again later." };
  }
  if (
    !(await checkRateLimit("recover-pw-global", {
      maxHits: 20,
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

  if (!isRecoverableEmail(email)) {
    return { error: GENERIC_FAIL };
  }

  try {
    const rows = await sql<{ id: string }>(
      "select id from users where lower(email) = $1",
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
    await markRecoverPasswordReset(email);

    if (await bothRecoverablePasswordsSet()) {
      return {
        ok: "Password updated for both imported accounts. Click Done, then remove IMPORT_SECRET.",
      };
    }
    return {
      ok: "Password updated. Set the other imported account, then remove IMPORT_SECRET.",
    };
  } catch (e) {
    console.error(
      "[recover-password] failed",
      e instanceof Error ? e.message : e,
    );
    return { error: "Could not update password. Try again." };
  }
}

export async function finishRecoverPasswordsAction(
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

  const user = await getCurrentUser();
  if (!user || !(await canUseRecoverPasswords(user.id))) {
    return { error: "Sign in required." };
  }

  const provided = formString(formData, "importSecret");
  const expected = getImportSecret();
  if (!provided || !importSecretsEqual(provided, expected)) {
    return { error: GENERIC_FAIL };
  }

  try {
    await lockRecoverPasswords();
    return {
      ok: "Recovery locked. Remove IMPORT_SECRET from app settings now.",
    };
  } catch (e) {
    console.error(
      "[recover-password] lock failed",
      e instanceof Error ? e.message : e,
    );
    return { error: "Could not finish. Try again." };
  }
}
