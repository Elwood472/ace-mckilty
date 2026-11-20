import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { ensureTwoFactorEnrolled, getCurrentUser } from "@/lib/session";
import {
  allowMathCaptchaFallback,
  getTurnstileSiteKey,
  issueMathChallenge,
  turnstileKeysReady,
} from "@/lib/captcha";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) {
    await ensureTwoFactorEnrolled(user.id);
    redirect("/dashboard");
  }
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
          Create your account
        </p>
        <p style={{ maxWidth: 360, marginBottom: 12, fontSize: 13, color: "#555" }}>
          We&apos;ll email a confirmation link before you can sign in.
        </p>
        <AuthForm
          mode="signup"
          csrf={csrf}
          turnstileSiteKey={turnstileSiteKey}
          mathChallenge={mathChallenge}
        />
      </main>
    </>
  );
}
