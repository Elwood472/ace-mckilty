import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import {
  allowMathCaptchaFallback,
  getTurnstileSiteKey,
  issueMathChallenge,
  turnstileKeysReady,
} from "@/lib/captcha";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import { ForgotPasswordForm } from "./form";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

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
          Forgot password
        </p>
        <p style={{ maxWidth: 420, marginBottom: 12 }}>
          Enter the email for your account. If it is on file, we will send a
          reset link.
        </p>
        <ForgotPasswordForm
          csrf={csrf}
          turnstileSiteKey={turnstileSiteKey}
          mathChallenge={mathChallenge}
        />
      </main>
    </>
  );
}
