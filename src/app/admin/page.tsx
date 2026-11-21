import Link from "next/link";
import { Flash } from "@/components/flash";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/lib/admin";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { activityClass, formatMdY, formatMdYTime } from "@/lib/dates";

type Props = {
  searchParams: Promise<{ q?: string; deleted?: string }>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  await ensureCsrfToken();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const deleted = (sp.deleted ?? "").trim();

  const users = q
    ? await sql<{
        id: string;
        email: string;
        display_name: string;
        created_at: string;
        last_active_at: string | null;
        totp_enabled: boolean;
        email_2fa_enabled: boolean;
        session_count: number;
      }>(
        `select u.id, u.email, u.display_name,
                u.created_at::text as created_at,
                u.last_active_at::text as last_active_at,
                u.totp_enabled, u.email_2fa_enabled,
                (select count(*)::int from sessions s
                  where s.user_id = u.id and s.expires_at > now()) as session_count
         from users u
         where u.email ilike '%' || $1 || '%'
            or u.display_name ilike '%' || $1 || '%'
         order by u.last_active_at desc nulls last, lower(u.display_name)
         limit 100`,
        [q],
      )
    : await sql<{
        id: string;
        email: string;
        display_name: string;
        created_at: string;
        last_active_at: string | null;
        totp_enabled: boolean;
        email_2fa_enabled: boolean;
        session_count: number;
      }>(
        `select u.id, u.email, u.display_name,
                u.created_at::text as created_at,
                u.last_active_at::text as last_active_at,
                u.totp_enabled, u.email_2fa_enabled,
                (select count(*)::int from sessions s
                  where s.user_id = u.id and s.expires_at > now()) as session_count
         from users u
         order by u.last_active_at desc nulls last,
                  lower(u.display_name), lower(u.email)
         limit 500`,
      );

  const total = await sql<{ n: number }>(
    "select count(*)::int as n from users",
  );

  return (
    <>
      <SiteHeader user={admin} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
        </p>
        <h1 style={{ color: "#000080", fontSize: 20, marginTop: 8 }}>
          Admin · Users
        </h1>
        <p style={{ fontSize: 13, color: "#555" }}>
          Support tools for {admin.email}. {total[0]?.n ?? 0} accounts total.
          Lookup and help only — not a public directory.
        </p>
        {deleted ? (
          <Flash ok={`Deleted account ${deleted}.`} />
        ) : null}

        <form method="get" action="/admin" style={{ marginBottom: 16, maxWidth: 420 }}>
          <label className="label" htmlFor="q">
            Search email or name
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="q"
              name="q"
              className="field"
              defaultValue={q}
              placeholder="charli@… or Charli"
            />
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </div>
        </form>

        <table className="legacy-table" style={{ maxWidth: 1100 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Last active</th>
              <th>2FA</th>
              <th>Sessions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7}>{q ? "No matches." : "No users."}</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  <td>{u.email}</td>
                  <td>{formatMdY(u.created_at)}</td>
                  <td className={activityClass(u.last_active_at)}>
                    {formatMdYTime(u.last_active_at)}
                  </td>
                  <td>
                    {[
                      u.totp_enabled ? "authenticator" : null,
                      u.email_2fa_enabled ? "email" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td align="right">{u.session_count}</td>
                  <td>
                    <Link href={`/admin/users/${u.id}`}>Open</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!q && (total[0]?.n ?? 0) > users.length ? (
          <p style={{ fontSize: 12, color: "#555" }}>
            Showing first {users.length}. Use search to find others.
          </p>
        ) : null}
      </main>
    </>
  );
}
