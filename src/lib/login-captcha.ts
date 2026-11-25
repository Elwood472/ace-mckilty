import "server-only";

import { getRateLimitHits } from "@/lib/rate-limit";

const SIGNIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
/** After this many failed logins from an IP, require CAPTCHA. */
export const SIGNIN_CAPTCHA_AFTER = 3;
export const SIGNIN_FAIL_WINDOW = SIGNIN_FAIL_WINDOW_MS;

export function signInFailKey(ip: string): string {
  return `signin-fail:${ip}`;
}

export async function loginCaptchaRequired(
  ip: string | null,
): Promise<boolean> {
  // No IP → treat as already over the threshold (fail closed; no shared bucket).
  if (!ip) return true;
  const fails = await getRateLimitHits(
    signInFailKey(ip),
    SIGNIN_FAIL_WINDOW_MS,
  );
  return fails >= SIGNIN_CAPTCHA_AFTER;
}
