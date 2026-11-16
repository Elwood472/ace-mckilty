import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { getTurnstileSiteKey, issueMathChallenge } from "@/lib/captcha";
import { getClientIp } from "@/lib/client-ip";
import { ensureCsrfToken } from "@/lib/csrf";
import { loginCaptchaRequired } from "@/lib/login-captcha";
import { ensureTwoFactorEnrolled, getCurrentUser } from "@/lib/session";
import { safeInternalPath } from "@/lib/url-safety";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const next = sp.next ? safeInternalPath(sp.next) : "/dashboard";
  if (user) {
    await ensureTwoFactorEnrolled(user.id);
    redirect(next);
  }
  const csrf = await ensureCsrfToken();
  const ip = await getClientIp();
  const needsCaptcha = await loginCaptchaRequired(ip);
  const turnstileSiteKey = needsCaptcha ? getTurnstileSiteKey() : null;
  const mathChallenge =
    needsCaptcha && !turnstileSiteKey ? issueMathChallenge() : null;
  const resetOk = sp.reset === "1";

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Log In
        </p>
        {resetOk ? (
          <p style={{ color: "#060", fontWeight: 700, marginBottom: 12 }}>
            Password updated. Sign in with your new password.
          </p>
        ) : null}
        <p>
          <b>User Name</b> (email) and <b>Password</b>:
        </p>
        <AuthForm
          mode="login"
          csrf={csrf}
          next={next !== "/dashboard" ? next : undefined}
          turnstileSiteKey={turnstileSiteKey}
          mathChallenge={mathChallenge}
        />
      </main>
    </>
  );
}
