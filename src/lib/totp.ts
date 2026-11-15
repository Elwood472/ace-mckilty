import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Secret, TOTP } from "otpauth";

const ISSUER = "Ace McKilty";

export function generateTotpSecret(): string {
  // 20 bytes → base32 secret suitable for authenticator apps.
  return new Secret({ size: 20 }).base32;
}

export function totpUri(opts: {
  secret: string;
  accountName: string;
}): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: opts.accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(opts.secret),
  });
  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  // Allow ±1 step clock skew.
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}

export function generateEmailOtp(): string {
  // 6 digits, never leading-zero stripped for display — always pad.
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function hashEmailOtp(code: string): string {
  return createHash("sha256")
    .update(`email-otp:${code.trim()}`)
    .digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
