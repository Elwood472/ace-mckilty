import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { isImportSecretConfigured } from "@/lib/dump-import";
import {
  bothRecoverablePasswordsSet,
  canUseRecoverPasswords,
  isRecoverPasswordLocked,
} from "@/lib/recover-passwords";
import { getCurrentUser } from "@/lib/session";
import { RecoverPasswordForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * Signed-in + IMPORT_SECRET only. Allowlisted imported emails.
 * 404 when secret unset or recovery permanently locked.
 */
export default async function RecoverPasswordsPage() {
  if (!isImportSecretConfigured()) {
    notFound();
  }
  if (await isRecoverPasswordLocked()) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/recover-passwords");
  }
  if (!(await canUseRecoverPasswords(user.id))) {
    notFound();
  }

  const csrf = await ensureCsrfToken();
  const bothSet = await bothRecoverablePasswordsSet();

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Set imported account password
        </p>
        <p style={{ marginBottom: 16, maxWidth: 36 * 16 }}>
          Signed-in operators only. Enter <code>IMPORT_SECRET</code> and set a
          new password for each imported account. Then lock recovery and remove
          that secret from app settings.
        </p>
        <RecoverPasswordForm csrf={csrf} bothSet={bothSet} />
      </main>
    </>
  );
}
