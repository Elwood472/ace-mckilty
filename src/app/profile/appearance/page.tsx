import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { requireAppUser } from "@/lib/session";
import { resolveTheme } from "@/lib/theme";
import { AppearanceForm } from "./form";

export default async function AppearancePage() {
  const user = await requireAppUser();
  const csrf = await ensureCsrfToken();
  const rows = await sql<{
    theme_accent: string;
    theme_page: string;
    theme_link: string;
  }>(
    `select theme_accent, theme_page, theme_link from users where id = $1`,
    [user.id],
  );
  const theme = resolveTheme(rows[0] ?? null);

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
          {" · "}
          <Link href="/profile/edit">Edit profile</Link>
          {" · "}
          <Link href="/profile/security">Security</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          Colors
        </h1>
        <p style={{ color: "#555", maxWidth: 520 }}>
          Pick an accent, page background, and link color for your account.
          These only change what you see while signed in.
        </p>
        <AppearanceForm csrf={csrf} initialTheme={theme} />
      </main>
    </>
  );
}
