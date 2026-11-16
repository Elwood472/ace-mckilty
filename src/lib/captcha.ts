import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * Abuse / CAPTCHA helpers.
 *
 * Hosted (DATABASE_URL set): Cloudflare Turnstile is required. There is no
 * math-puzzle fallback in production — bind TURNSTILE_SITE_KEY +
 * TURNSTILE_SECRET_KEY.
 *
 * Local (no DATABASE_URL): Cloudflare always-pass test keys, or a signed
 * math challenge + small proof-of-work if Turnstile env is unset.
 */

const MATH_TTL_MS = 10 * 60 * 1000;
/** Hex leading zeros required of sha256(`${powSalt}:${powNonce}`). */
/** Keep low enough for browsers; raised slightly to slow naive bots. */
const POW_DIFFICULTY = 4;
const MIN_DWELL_MS = 3000;

/** Process-lifetime secret when no env secret is bound (never a shipped literal). */
let runtimeSecret: Buffer | null = null;

function hmacSecretBytes(): Buffer {
  const fromEnv =
    process.env.CAPTCHA_HMAC_SECRET?.trim() ||
    process.env.CSRF_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim();
  if (fromEnv) return Buffer.from(fromEnv, "utf8");
  // Process-lifetime only — never derive from DATABASE_URL (predictable).
  // Bind CAPTCHA_HMAC_SECRET (or Turnstile) so all workers share one key.
  if (!runtimeSecret) {
    runtimeSecret = randomBytes(32);
  }
  return runtimeSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", hmacSecretBytes())
    .update(payload)
    .digest("base64url");
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
  powSalt: string;
  powDifficulty: number;
};

/**
 * Issue a short-lived math challenge.
 * Token carries expiry + nonce + HMAC(answer) — operands are NOT in the token.
 * Client must also solve a small PoW against powSalt.
 */
export function issueMathChallenge(): MathChallenge {
  const a = 11 + randomInt(0, 29); // 11..39
  const b = 11 + randomInt(0, 29);
  const op = randomInt(0, 2); // 0 add, 1 subtract (non-negative)
  let prompt: string;
  let answer: number;
  if (op === 0) {
    prompt = `What is ${a} + ${b}?`;
    answer = a + b;
  } else {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    prompt = `What is ${hi} − ${lo}?`;
    answer = hi - lo;
  }
  const exp = Date.now() + MATH_TTL_MS;
  const nonce = randomBytes(16).toString("base64url");
  const body = `v2.${exp}.${nonce}`;
  const sig = sign(`${body}.${answer}`);
  const token = `${body}.${sig}`;
  const powSalt = randomBytes(16).toString("base64url");
  return {
    prompt,
    token,
    powSalt,
    powDifficulty: POW_DIFFICULTY,
  };
}

function verifyPow(
  salt: string,
  nonce: string,
  difficulty: number,
): boolean {
  if (!salt || !nonce || nonce.length > 64 || salt.length > 64) return false;
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 8) {
    return false;
  }
  const digest = createHash("sha256")
    .update(`${salt}:${nonce}`)
    .digest("hex");
  return digest.startsWith("0".repeat(difficulty));
}

function verifyMathChallenge(
  token: string,
  answerRaw: string,
  powSalt: string,
  powNonce: string,
): boolean {
  if (!verifyPow(powSalt, powNonce, POW_DIFFICULTY)) return false;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return false;
  const [, expStr, nonce, sig] = parts;
  if (!expStr || !nonce || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const answer = Number(String(answerRaw).trim());
  if (!Number.isInteger(answer) || answer < 0 || answer > 200) return false;

  const body = `v2.${expStr}.${nonce}`;
  const expected = sign(`${body}.${answer}`);
  return safeEqual(expected, sig);
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

/** True when a usable CAPTCHA can be shown (Turnstile, or local math only). */
export function captchaConfigured(): boolean {
  if (getTurnstileSiteKey()) return true;
  // Math fallback is local-only.
  return !process.env.DATABASE_URL?.trim();
}

/**
 * Validate human checks on auth forms:
 * 1) Honeypot must be empty
 * 2) Form must not submit instantly (min dwell)
 * 3) Turnstile when configured; math + PoW only on local (no DATABASE_URL)
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
  if (!Number.isFinite(issued) || Date.now() - issued < MIN_DWELL_MS) {
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

  // Hosted Postgres: never fall back to the weaker math puzzle.
  if (process.env.DATABASE_URL?.trim()) {
    return {
      ok: false,
      error: "Sign-up protection is temporarily unavailable. Try again later.",
    };
  }

  const mathToken =
    typeof formData.get("captcha_token") === "string"
      ? String(formData.get("captcha_token"))
      : "";
  const mathAnswer =
    typeof formData.get("captcha_answer") === "string"
      ? String(formData.get("captcha_answer"))
      : "";
  const powSalt =
    typeof formData.get("captcha_pow_salt") === "string"
      ? String(formData.get("captcha_pow_salt"))
      : "";
  const powNonce =
    typeof formData.get("captcha_pow_nonce") === "string"
      ? String(formData.get("captcha_pow_nonce"))
      : "";
  if (!verifyMathChallenge(mathToken, mathAnswer, powSalt, powNonce)) {
    return {
      ok: false,
      error: "CAPTCHA answer was wrong or expired. Refresh and try again.",
    };
  }
  return { ok: true };
}
