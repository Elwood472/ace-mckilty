import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { ensureTwoFactorEnrolled, getCurrentUser } from "@/lib/session";
import { getTurnstileSiteKey, issueMathChallenge } from "@/lib/captcha";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) {
    await ensureTwoFactorEnrolled(user.id);
    redirect("/dashboard");
  }
  const csrf = await ensureCsrfToken();
  const turnstileSiteKey = getTurnstileSiteKey();
  // Math CAPTCHA is local-only; hosted requires Turnstile secrets.
  const mathChallenge =
    !turnstileSiteKey && !process.env.DATABASE_URL?.trim()
      ? issueMathChallenge()
      : null;

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Create your account
        </p>
        {!turnstileSiteKey && !mathChallenge ? (
          <p style={{ color: "#cc0000", fontWeight: 700 }}>
            Sign-up protection is temporarily unavailable. Try again later.
          </p>
        ) : (
          <AuthForm
            mode="signup"
            csrf={csrf}
            turnstileSiteKey={turnstileSiteKey}
            mathChallenge={mathChallenge}
          />
        )}
      </main>
    </>
  );
}
