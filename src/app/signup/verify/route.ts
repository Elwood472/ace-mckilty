import { NextResponse } from "next/server";
import {
  clearPendingSignupEmail,
  clearVerifyTokenCookie,
  confirmEmailVerification,
  readVerifyTokenCookie,
} from "@/lib/email-verify";
import { createSession } from "@/lib/session";

/**
 * Completes signup email confirmation. Token arrives via httpOnly cookie
 * (middleware redeemed ?token= from the email link).
 */
export async function GET(request: Request) {
  const token = await readVerifyTokenCookie();
  const fail = NextResponse.redirect(
    new URL("/signup/check-email?error=1", request.url),
  );

  if (!token) return fail;

  const result = await confirmEmailVerification(token);
  await clearVerifyTokenCookie();
  if (!result.ok) return fail;

  await createSession(result.userId);
  await clearPendingSignupEmail();
  return NextResponse.redirect(
    new URL("/profile/security?setup=1", request.url),
  );
}
