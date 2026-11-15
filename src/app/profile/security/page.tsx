import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import {
  emailSendingConfigured,
  emailTwoFactorAvailable,
  getUserTwoFactor,
} from "@/lib/two-factor";
import { SecuritySettingsForm } from "./form";

export default async function SecuritySettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile/security");
  const csrf = await ensureCsrfToken();
  const flags = await getUserTwoFactor(user.id);
  if (!flags) redirect("/dashboard");

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
          {" · "}
          <Link href="/profile/edit">Edit profile</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          Sign-in security
        </h1>
        <p style={{ color: "#555", maxWidth: 560 }}>
          Optionally require a second step after your password. You can use an
          authenticator app, email codes, or both.
        </p>
        <SecuritySettingsForm
          csrf={csrf}
          totpEnabled={flags.totp_enabled}
          emailEnabled={flags.email_2fa_enabled}
          emailAvailable={emailTwoFactorAvailable()}
          emailLive={emailSendingConfigured()}
        />
      </main>
    </>
  );
}
