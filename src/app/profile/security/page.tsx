import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile/security");
  const csrf = await ensureCsrfToken();
  const flags = await getUserTwoFactor(user.id);
  if (!flags) redirect("/dashboard");

  const sp = await searchParams;
  const enrolled = userNeedsTwoFactor(flags);
  const setupRequired = sp.setup === "1" || !enrolled;

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
        <p style={{ color: "#555", maxWidth: 560 }}>
          {setupRequired
            ? "Turn on an authenticator app and/or email codes before you continue. At least one method is required."
            : "Manage your second step after password. Keep at least one method on."}
        </p>
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
