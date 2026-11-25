"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertHuman } from "@/lib/captcha";
import { checkClientIpRateLimit, getClientIp } from "@/lib/client-ip";
import { assertCsrf } from "@/lib/csrf";
import {
  clearResetTokenCookie,
  consumeResetTokenAndSetPassword,
  readResetTokenCookie,
  requestPasswordReset,
} from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";

function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type PasswordResetState = {
  error?: string;
  ok?: string;
  stubResetUrl?: string;
};

const emailSchema = z.string().email().max(320);

export async function requestPasswordResetAction(
  _prev: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  try {
    const ip = await getClientIp();
    const human = await assertHuman(formData, ip);
    if (!human.ok) return { error: human.error };

    if (
      !(await checkClientIpRateLimit("pw-reset-ip", {
        maxHits: 5,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }

    const email = formString(formData, "email").toLowerCase();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      return { error: "Enter a valid email." };
    }

    if (
      !(await checkRateLimit(`pw-reset-email:${email}`, {
        maxHits: 3,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      // Same generic success — do not confirm the address exists.
      return {
        ok: "If that email is on file, we sent a reset link. Check your inbox.",
      };
    }

    const result = await requestPasswordReset(email);
    return {
      ok: "If that email is on file, we sent a reset link. Check your inbox.",
      stubResetUrl: result.stubResetUrl,
    };
  } catch (e) {
    console.error("[auth] password reset request failed", e);
    return { error: "Could not start a reset. Try again in a moment." };
  }
}

export async function completePasswordResetAction(
  _prev: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  try {
    await assertCsrf(formData.get("csrf"));
  } catch {
    return { error: "Invalid request. Refresh and try again." };
  }

  let done = false;
  try {
    const ip = await getClientIp();
    const human = await assertHuman(formData, ip);
    if (!human.ok) return { error: human.error };

    if (
      !(await checkClientIpRateLimit("pw-reset-complete", {
        maxHits: 10,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return { error: "Too many attempts. Try again later." };
    }

    const token = await readResetTokenCookie();
    const password = formString(formData, "password");
    const confirm = formString(formData, "confirm");
    if (password !== confirm) {
      return { error: "Passwords do not match." };
    }

    const result = await consumeResetTokenAndSetPassword(token, password);
    if (!result.ok) return { error: result.error };
    await clearResetTokenCookie();
    done = true;
  } catch (e) {
    console.error("[auth] password reset complete failed", e);
    return { error: "Could not reset password. Try again." };
  }

  if (done) redirect("/login?reset=1");
  return { error: "Could not reset password. Try again." };
}
