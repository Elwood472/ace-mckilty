import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { isImportSecretConfigured } from "@/lib/dump-import";
import { getCurrentUser } from "@/lib/session";
import { RecoverPasswordForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * Available only while IMPORT_SECRET is bound — used after dump import when
 * original passwords are unknown. Remove the secret once accounts work.
 */
export default async function RecoverPasswordsPage() {
  if (!isImportSecretConfigured()) {
    notFound();
  }

  const user = await getCurrentUser();
  const csrf = await ensureCsrfToken();

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Set account password
        </p>
        <p style={{ marginBottom: 16, maxWidth: 36 * 16 }}>
          Use your <code>IMPORT_SECRET</code> to set a new password for an
          imported account. When both accounts work, remove that secret from app
          settings.
        </p>
        <RecoverPasswordForm csrf={csrf} />
      </main>
    </>
  );
}
