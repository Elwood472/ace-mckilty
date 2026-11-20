import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";

const CSRF_COOKIE = "gr_csrf";
const RESET_TOKEN_COOKIE = "gr_pw_reset";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Password-reset email links land with ?token= once. Stash the token in an
  // httpOnly cookie and strip it from the URL so it cannot leak via Referer
  // if the user clicks an external link before finishing the reset.
  // Double-submit CSRF: token is mirrored into hidden form fields by the
  // server (CsrfField). Cookie must be httpOnly so XSS cannot read it.
  const csrf = request.cookies.get(CSRF_COOKIE)?.value || nanoid(32);

  if (pathname === "/login/reset") {
    const raw = request.nextUrl.searchParams.get("token");
    if (raw && raw.trim()) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete("token");
      const redirect = NextResponse.redirect(clean);
      redirect.cookies.set(CSRF_COOKIE, csrf, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      redirect.cookies.set(RESET_TOKEN_COOKIE, raw.trim(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/login/reset",
        maxAge: 60 * 60,
      });
      redirect.headers.set("Referrer-Policy", "no-referrer");
      return redirect;
    }
  }

  const response = NextResponse.next();
  // Re-set on each request so older non-httpOnly cookies get upgraded.
  response.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  if (pathname === "/login/reset" || pathname === "/login/forgot") {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
