import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import {
  readPendingSignupEmail,
  readStubVerifyUrl,
} from "@/lib/email-verify";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ResendVerifyForm } from "./form";

export default async function SignupCheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const sp = await searchParams;
  const linkError = sp.error === "1";
  const csrf = await ensureCsrfToken();
  const pendingEmail = await readPendingSignupEmail();
  const stubUrl = await readStubVerifyUrl();

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Confirm your email
        </p>
        {linkError ? (
          <p style={{ color: "#cc0000", fontWeight: 700, maxWidth: 420 }}>
            That confirmation link is invalid or expired. Request a new one
            below.
          </p>
        ) : (
          <p style={{ maxWidth: 420, marginBottom: 12 }}>
            We sent a confirmation link
            {pendingEmail ? (
              <>
                {" "}
                to <b>{pendingEmail}</b>
              </>
            ) : null}
            . Open it to finish creating your account. The link expires in 24
            hours.
          </p>
        )}
        {stubUrl ? (
          <p style={{ fontSize: 12, color: "#555", maxWidth: 480 }}>
            Local stub link: <Link href={stubUrl}>{stubUrl}</Link>
          </p>
        ) : null}
        <div className="panel" style={{ padding: 16, maxWidth: 360, marginTop: 12 }}>
          <ResendVerifyForm csrf={csrf} defaultEmail={pendingEmail} />
        </div>
        <p style={{ marginTop: 12, fontSize: 12 }}>
          <Link href="/login">← Back to login</Link>
        </p>
      </main>
    </>
  );
}
