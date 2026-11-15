import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash } from "@/components/flash";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import {
  emailSendingConfigured,
  emailTwoFactorAvailable,
  getUserTwoFactor,
  userNeedsTwoFactor,
} from "@/lib/two-factor";
import { SecuritySettingsForm } from "./form";

function setupSuccessMessage(ok: string | undefined): string | null {
  if (ok === "authenticator") {
    return "Success — your authenticator app is set up and turned on. You can continue to Home.";
  }
  if (ok === "email") {
    return "Success — email sign-in codes are turned on. You can continue to Home.";
  }
  return null;
}

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile/security");
  const csrf = await ensureCsrfToken();
  const flags = await getUserTwoFactor(user.id);
  if (!flags) redirect("/dashboard");

  const sp = await searchParams;
  const enrolled = userNeedsTwoFactor(flags);
  const setupRequired = (sp.setup === "1" || !enrolled) && !sp.ok;
  const success = setupSuccessMessage(sp.ok);

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        {enrolled ? (
          <p>
            <Link href="/dashboard">← Home</Link>
            {" · "}
            <Link href="/profile/edit">Edit profile</Link>
          </p>
        ) : null}
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          {setupRequired ? "Set up two-factor sign-in" : "Sign-in security"}
        </h1>
        {success ? (
          <div style={{ maxWidth: 560, marginTop: 12 }}>
            <Flash ok={success} />
            <p style={{ marginTop: 8 }}>
              <Link href="/dashboard" className="btn btn-primary">
                Continue to Home
              </Link>
            </p>
          </div>
        ) : (
          <p style={{ color: "#555", maxWidth: 560 }}>
            {setupRequired
              ? "Turn on an authenticator app and/or email codes before you continue. At least one method is required."
              : "Manage your second step after password. Keep at least one method on."}
          </p>
        )}
        <SecuritySettingsForm
          csrf={csrf}
          totpEnabled={flags.totp_enabled}
          emailEnabled={flags.email_2fa_enabled}
          emailAvailable={emailTwoFactorAvailable()}
          emailLive={emailSendingConfigured()}
          setupRequired={setupRequired && !enrolled}
        />
      </main>
    </>
  );
}
