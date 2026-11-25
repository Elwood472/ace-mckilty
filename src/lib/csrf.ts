import { cookies } from "next/headers";
import { nanoid } from "nanoid";

export const CSRF_COOKIE = "gr_csrf";

/**
 * Read CSRF token set by middleware (httpOnly double-submit cookie).
 * Mints one if missing so server-rendered forms always get a value.
 */
export async function ensureCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const token = nanoid(32);
  jar.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return token;
}

export async function assertCsrf(token: FormDataEntryValue | null): Promise<void> {
  const jar = await cookies();
  const cookie = jar.get(CSRF_COOKIE)?.value;
  if (!cookie || typeof token !== "string" || token !== cookie) {
    throw new Error("INVALID_CSRF");
  }
}
