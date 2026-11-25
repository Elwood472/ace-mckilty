import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";

const CSRF_COOKIE = "gr_csrf";
const RESET_TOKEN_COOKIE = "gr_pw_reset";
const VERIFY_TOKEN_COOKIE = "gr_email_verify";

function stashTokenRedirect(
  request: NextRequest,
  csrf: string,
  cookieName: string,
  cookiePath: string,
) {
  const raw = request.nextUrl.searchParams.get("token");
  if (!raw?.trim()) return null;
  const clean = request.nextUrl.clone();
  clean.searchParams.delete("token");
  const redirect = NextResponse.redirect(clean);
  redirect.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  redirect.cookies.set(cookieName, raw.trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath,
    maxAge: 60 * 60,
  });
  redirect.headers.set("Referrer-Policy", "no-referrer");
  return redirect;
}

/** Repo / tooling paths that must never be served as static files. */
const BLOCKED_PREFIXES = [
  "/scripts",
  "/migrations",
  "/src",
  "/node_modules",
  "/.git",
  "/.data",
];

const BLOCKED_EXACT = new Set([
  "/package.json",
  "/package-lock.json",
  "/tsconfig.json",
  "/next.config.ts",
  "/next.config.js",
  "/eslint.config.mjs",
  "/readme.md",
  "/readme",
  "/agents.md",
  "/cursor-app.json",
]);

function isBlockedSourcePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (BLOCKED_EXACT.has(path)) return true;
  return BLOCKED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cursor App Hosting may expose uploaded files by path; refuse tooling/source.
  if (isBlockedSourcePath(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const csrf = request.cookies.get(CSRF_COOKIE)?.value || nanoid(32);

  // Email links land with ?token= once; stash into httpOnly cookie and strip
  // the query so the token cannot leak via Referer.
  if (pathname === "/login/reset") {
    const redirected = stashTokenRedirect(
      request,
      csrf,
      RESET_TOKEN_COOKIE,
      "/login/reset",
    );
    if (redirected) return redirected;
  }
  if (pathname === "/signup/verify") {
    const redirected = stashTokenRedirect(
      request,
      csrf,
      VERIFY_TOKEN_COOKIE,
      "/signup/verify",
    );
    if (redirected) return redirected;
  }

  const response = NextResponse.next();
  response.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  if (
    pathname === "/login/reset" ||
    pathname === "/login/forgot" ||
    pathname === "/signup/verify" ||
    pathname === "/signup/check-email"
  ) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
