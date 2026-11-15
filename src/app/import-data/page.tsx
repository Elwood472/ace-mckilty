import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import {
  getImportGate,
  isImportSecretConfigured,
} from "@/lib/dump-import";
import { getCurrentUser } from "@/lib/session";
import { ImportDataForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ImportDataPage() {
  // No indexable hints when disabled or permanently locked.
  if (!isImportSecretConfigured()) {
    notFound();
  }

  let gate;
  try {
    gate = await getImportGate();
  } catch {
    notFound();
  }
  if (!gate.available || gate.locked) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/import-data");
  }

  // Re-check eligibility with session user (bootstrap sole-user case).
  try {
    gate = await getImportGate(user.id);
  } catch {
    notFound();
  }
  if (!gate.available || gate.locked || !gate.eligible) {
    notFound();
  }

  const csrf = await ensureCsrfToken();

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          One-time data import
        </p>
        <p style={{ marginBottom: 16, maxWidth: 36 * 16 }}>
          Signed-in one-shot seed for an empty database. Requires{" "}
          <code>IMPORT_SECRET</code>. After success, remove that secret; this
          page will not work again.
        </p>
        <ImportDataForm csrf={csrf} />
      </main>
    </>
  );
}
