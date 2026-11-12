import { cookies } from "next/headers";

export const CSRF_COOKIE = "gr_csrf";

/** Read CSRF token set by middleware. */
export async function ensureCsrfToken(): Promise<string> {
  const jar = await cookies();
  return jar.get(CSRF_COOKIE)?.value ?? "";
}

export async function assertCsrf(token: FormDataEntryValue | null): Promise<void> {
  const jar = await cookies();
  const cookie = jar.get(CSRF_COOKIE)?.value;
  if (!cookie || typeof token !== "string" || token !== cookie) {
    throw new Error("INVALID_CSRF");
  }
}
