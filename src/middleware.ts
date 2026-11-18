import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";

const CSRF_COOKIE = "gr_csrf";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  // Double-submit CSRF: token is mirrored into hidden form fields by the
  // server (CsrfField). Cookie must be httpOnly so XSS cannot read it.
  // Re-set on each request so older non-httpOnly cookies get upgraded.
  const token = request.cookies.get(CSRF_COOKIE)?.value || nanoid(32);
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
