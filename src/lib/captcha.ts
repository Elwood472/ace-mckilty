import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Abuse / CAPTCHA helpers.
 *
 * Prefer Cloudflare Turnstile when TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY
 * are set (bind as app secrets). Otherwise use a signed math challenge so
 * signup/signin always require a human check — including local / before secrets.
 *
 * Cloudflare always-pass test keys are used only when DATABASE_URL is unset
 * (local PGlite), never as a production fallback.
 */

const MATH_TTL_MS = 10 * 60 * 1000;

function hmacSecret(): string {
  return (
    process.env.CAPTCHA_HMAC_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.CSRF_SECRET?.trim() ||
    "ace-mckilty-local-captcha"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", hmacSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function getTurnstileSiteKey(): string | null {
  const configured = process.env.TURNSTILE_SITE_KEY?.trim();
  if (configured) return configured;
  // Local-only Cloudflare test key (always passes). Never for published Postgres.
  if (!process.env.DATABASE_URL?.trim()) {
    return "1x00000000000000000000AA";
  }
  return null;
}

function getTurnstileSecret(): string | null {
  const configured = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (configured) return configured;
  if (!process.env.DATABASE_URL?.trim()) {
    return "1x0000000000000000000000000000000AA";
  }
  return null;
}

export type MathChallenge = {
  prompt: string;
  token: string;
};

/** Issue a short-lived a+b challenge for the auth form. */
export function issueMathChallenge(): MathChallenge {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  const exp = Date.now() + MATH_TTL_MS;
  const body = `${a}.${b}.${exp}`;
  const token = `${body}.${sign(body)}`;
  return { prompt: `What is ${a} + ${b}?`, token };
}

function verifyMathChallenge(token: string, answerRaw: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [aStr, bStr, expStr, sig] = parts;
  const body = `${aStr}.${bStr}.${expStr}`;
  if (!safeEqual(sign(body), sig)) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const a = Number(aStr);
  const b = Number(bStr);
  const answer = Number(String(answerRaw).trim());
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(answer)) {
    return false;
  }
  return a + b === answer;
}

async function verifyTurnstile(
  token: string,
  ip: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = getTurnstileSecret();
  if (!secret) return { ok: false, error: "CAPTCHA is not configured." };
  if (!token) return { ok: false, error: "Complete the CAPTCHA and try again." };

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return { ok: false, error: "CAPTCHA failed. Refresh and try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "CAPTCHA check failed. Try again." };
  }
}

/**
 * Validate human checks on auth forms:
 * 1) Honeypot must be empty
 * 2) Form must not submit instantly (min dwell)
 * 3) Turnstile token when site key is active, else math answer
 */
export async function assertHuman(
  formData: FormData,
  ip: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const honey = formData.get("company_website");
  if (typeof honey === "string" && honey.trim() !== "") {
    return { ok: false, error: "Could not complete request." };
  }

  const issuedRaw = formData.get("form_issued_at");
  const issued =
    typeof issuedRaw === "string" ? Number(issuedRaw) : Number.NaN;
  if (!Number.isFinite(issued) || Date.now() - issued < 1200) {
    return { ok: false, error: "Please wait a moment and try again." };
  }
  if (Date.now() - issued > 60 * 60 * 1000) {
    return { ok: false, error: "Form expired. Refresh and try again." };
  }

  const siteKey = getTurnstileSiteKey();
  if (siteKey) {
    const token =
      typeof formData.get("cf-turnstile-response") === "string"
        ? String(formData.get("cf-turnstile-response")).trim()
        : "";
    return verifyTurnstile(token, ip);
  }

  const mathToken =
    typeof formData.get("captcha_token") === "string"
      ? String(formData.get("captcha_token"))
      : "";
  const mathAnswer =
    typeof formData.get("captcha_answer") === "string"
      ? String(formData.get("captcha_answer"))
      : "";
  if (!verifyMathChallenge(mathToken, mathAnswer)) {
    return {
      ok: false,
      error: "CAPTCHA answer was wrong or expired. Refresh and try again.",
    };
  }
  return { ok: true };
}
