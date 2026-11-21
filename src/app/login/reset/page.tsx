import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import {
  allowMathCaptchaFallback,
  getTurnstileSiteKey,
  issueMathChallenge,
  turnstileKeysReady,
} from "@/lib/captcha";
import { ensureCsrfToken } from "@/lib/csrf";
import { readResetTokenCookie } from "@/lib/password-reset";
import { getCurrentUser } from "@/lib/session";
import { ResetPasswordForm } from "./form";

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // Token lives only in the httpOnly cookie after middleware redeem.
  // Do not pre-check validity here — that would tip off whether a token
  // is still good before submit.
  const token = await readResetTokenCookie();
  const hasToken = token.length >= 20 && token.length <= 200;
  const csrf = await ensureCsrfToken();
  const turnstileSiteKey = turnstileKeysReady()
    ? getTurnstileSiteKey()
    : null;
  const mathChallenge =
    !turnstileSiteKey && allowMathCaptchaFallback()
      ? await issueMathChallenge()
      : null;

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Choose a new password
        </p>
        {hasToken ? (
          <ResetPasswordForm
            csrf={csrf}
            turnstileSiteKey={turnstileSiteKey}
            mathChallenge={mathChallenge}
          />
        ) : (
          <div className="panel" style={{ padding: 16, maxWidth: 360 }}>
            <p style={{ fontWeight: 700, color: "#cc0000" }}>
              This reset link is invalid or expired.
            </p>
            <p style={{ fontSize: 13 }}>
              <Link href="/login/forgot">Request a new reset link</Link>
              {" · "}
              <Link href="/login">Log in</Link>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
