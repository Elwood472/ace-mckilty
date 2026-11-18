import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import {
  allowMathCaptchaFallback,
  getTurnstileSiteKey,
  issueMathChallenge,
} from "@/lib/captcha";
import { ensureCsrfToken } from "@/lib/csrf";
import { findValidResetToken } from "@/lib/password-reset";
import { getCurrentUser } from "@/lib/session";
import { ResetPasswordForm } from "./form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.trim() : "";
  const valid = token ? await findValidResetToken(token) : null;
  const csrf = await ensureCsrfToken();
  const turnstileSiteKey = getTurnstileSiteKey();
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
        {valid ? (
          <ResetPasswordForm
            csrf={csrf}
            token={token}
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
