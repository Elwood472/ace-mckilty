import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { countUsers, getImportSecret } from "@/lib/dump-import";
import { ImportDataForm } from "./form";

export default async function ImportDataPage() {
  const csrf = await ensureCsrfToken();
  const secretConfigured = getImportSecret().length > 0;
  let userCount: number | null = null;
  let statusError: string | undefined;
  try {
    userCount = await countUsers();
  } catch {
    statusError = "Could not read database status.";
  }

  const empty = userCount === 0;
  const ready =
    secretConfigured && empty && userCount !== null && !statusError;

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          One-time data import
        </p>
        <p style={{ marginBottom: 16, maxWidth: 36 * 16 }}>
          Upload a portable gift-registry dump when the database has no users
          yet. Requires the app secret <code>IMPORT_SECRET</code>. After a
          successful import, remove that secret.
        </p>

        {statusError ? (
          <p style={{ color: "#800" }}>{statusError}</p>
        ) : !secretConfigured ? (
          <p style={{ color: "#600" }}>
            Import is not enabled (no import secret bound).
          </p>
        ) : userCount === null ? (
          <p style={{ color: "#600" }}>Database schema is not ready.</p>
        ) : !empty ? (
          <p style={{ color: "#060" }}>
            Database already has accounts. Import is disabled.
          </p>
        ) : (
          <p style={{ color: "#060", marginBottom: 12 }}>
            Database is empty. You can import once.
          </p>
        )}

        {ready ? <ImportDataForm csrf={csrf} /> : null}
      </main>
    </>
  );
}
