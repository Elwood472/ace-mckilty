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
 * Hosted / production: Cloudflare Turnstile is required
 * (TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY). There is no math/PoW fallback —
 * client-solvable puzzles are not an acceptable production default.
 *
 * Local (no DATABASE_URL, non-production): Cloudflare always-pass test keys
 * are used so signup/login work without real Turnstile. Math+PoW remains only
 * as a local last resort if those test keys are somehow unavailable.
 *
 * Optional CAPTCHA_HMAC_SECRET / CSRF_SECRET override the math HMAC key when
 * the local math path is used.
 */

/** True for Cursor-hosted Postgres or any NODE_ENV=production deploy. */
function requiresTurnstile(): boolean {
  return Boolean(
    process.env.DATABASE_URL?.trim() || process.env.NODE_ENV === "production",
  );
}

const MATH_TTL_MS = 10 * 60 * 1000;
/** Hex leading zeros required of sha256(`${powSalt}:${powNonce}`). */
/** ~1M hash trials expected; still fine in-browser, expensive for naive bots. */
const POW_DIFFICULTY = 5;
/** Prefer Turnstile in production — set TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY. */
const MIN_DWELL_MS = 4000;
const DB_SECRET_NAME = "captcha_hmac";

/** Process-lifetime secret when no env/DB secret is bound (local only). */
let runtimeSecret: Buffer | null = null;
/** Cache the DB-backed secret after first load (per worker). */
let dbSecretCache: Buffer | null = null;

async function hmacSecretBytes(): Promise<Buffer> {
  const fromEnv =
    process.env.CAPTCHA_HMAC_SECRET?.trim() ||
    process.env.CSRF_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim();
  if (fromEnv) return Buffer.from(fromEnv, "utf8");

  // Local PGlite: process-lifetime key is fine (single process).
  if (!process.env.DATABASE_URL?.trim()) {
    if (!runtimeSecret) {
      runtimeSecret = randomBytes(32);
    }
    return runtimeSecret;
  }

  if (dbSecretCache) return dbSecretCache;

  const { sql } = await import("@/lib/db");
  const existing = await sql<{ value: string }>(
    `select value from app_runtime_secrets where name = $1`,
    [DB_SECRET_NAME],
  );
  if (existing[0]?.value) {
    dbSecretCache = Buffer.from(existing[0].value, "hex");
    return dbSecretCache;
  }

  const generated = randomBytes(32).toString("hex");
  await sql(
    `insert into app_runtime_secrets (name, value)
     values ($1, $2)
     on conflict (name) do nothing`,
    [DB_SECRET_NAME, generated],
  );
  const again = await sql<{ value: string }>(
    `select value from app_runtime_secrets where name = $1`,
    [DB_SECRET_NAME],
  );
  const value = again[0]?.value ?? generated;
  dbSecretCache = Buffer.from(value, "hex");
  return dbSecretCache;
}

async function sign(payload: string): Promise<string> {
  const key = await hmacSecretBytes();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Cloudflare publishes these as always-pass / always-fail test keys. */
const TURNSTILE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "3x00000000000000000000FF",
]);
const TURNSTILE_TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export function getTurnstileSiteKey(): string | null {
  const configured = process.env.TURNSTILE_SITE_KEY?.trim();
  if (configured) {
    // Hosted/production must not use Cloudflare always-pass test keys.
    if (requiresTurnstile() && TURNSTILE_TEST_SITE_KEYS.has(configured)) {
      return null;
    }
    return configured;
  }
  // Local-only Cloudflare test key (always passes). Never in production/hosted.
  if (!requiresTurnstile()) {
    return "1x00000000000000000000AA";
  }
  return null;
}

function getTurnstileSecret(): string | null {
  const configured = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (configured) {
    if (requiresTurnstile() && TURNSTILE_TEST_SECRETS.has(configured)) {
      return null;
    }
    return configured;
  }
  if (!requiresTurnstile()) {
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
export async function issueMathChallenge(): Promise<MathChallenge> {
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
  const sig = await sign(`${body}.${answer}`);
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

async function verifyMathChallenge(
  token: string,
  answerRaw: string,
  powSalt: string,
  powNonce: string,
): Promise<boolean> {
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
  const expected = await sign(`${body}.${answer}`);
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

/**
 * Validate human checks on auth forms:
 * 1) Honeypot must be empty
 * 2) Form must not submit instantly (min dwell)
 * 3) Turnstile when configured (required on hosted); local-only math + PoW else
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
  const secret = getTurnstileSecret();
  if (siteKey && secret) {
    const token =
      typeof formData.get("cf-turnstile-response") === "string"
        ? String(formData.get("cf-turnstile-response")).trim()
        : "";
    return verifyTurnstile(token, ip);
  }

  // Hosted / production: never fall back to client-solvable math CAPTCHA.
  if (requiresTurnstile()) {
    return {
      ok: false,
      error: "CAPTCHA is not configured. Try again later.",
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
  if (!(await verifyMathChallenge(mathToken, mathAnswer, powSalt, powNonce))) {
    return {
      ok: false,
      error: "CAPTCHA answer was wrong or expired. Refresh and try again.",
    };
  }
  return { ok: true };
}

/** True when the local math+PoW path may be offered (never hosted/production). */
export function allowMathCaptchaFallback(): boolean {
  return !requiresTurnstile();
}
