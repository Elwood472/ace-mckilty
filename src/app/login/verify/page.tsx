import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import { getActiveChallenge } from "@/lib/two-factor";
import { VerifyTwoFactorForm } from "./form";

export default async function LoginVerifyPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const challenge = await getActiveChallenge();
  if (!challenge) redirect("/login");

  const csrf = await ensureCsrfToken();
  const methods: string[] = [];
  if (challenge.totp_enabled) methods.push("authenticator app");
  if (challenge.email_2fa_enabled) methods.push("email");

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Two-factor verification
        </p>
        <p style={{ maxWidth: 420, marginBottom: 12 }}>
          Enter a code from your{" "}
          {methods.length === 2
            ? "authenticator app or email"
            : methods[0] === "email"
              ? "email"
              : "authenticator app"}
          .
        </p>
        {challenge.email_2fa_enabled ? (
          <p style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
            {challenge.email_sent_at
              ? "We sent a code to your account email."
              : "We could not send email just now — use your authenticator if you have one, or try Resend below."}
          </p>
        ) : null}
        <VerifyTwoFactorForm
          csrf={csrf}
          showEmailResend={challenge.email_2fa_enabled}
        />
        <p style={{ marginTop: 16, fontSize: 12 }}>
          <Link href="/login">← Back to login</Link>
        </p>
      </main>
    </>
  );
}
