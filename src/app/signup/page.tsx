import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import { getTurnstileSiteKey, issueMathChallenge } from "@/lib/captcha";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const csrf = await ensureCsrfToken();
  const turnstileSiteKey = getTurnstileSiteKey();
  const mathChallenge = turnstileSiteKey ? null : issueMathChallenge();

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Create your account
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
