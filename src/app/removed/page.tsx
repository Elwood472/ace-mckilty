import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatMdY } from "@/lib/dates";
import { RemovedActions } from "./removed-actions";

export default async function RemovedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const csrf = await ensureCsrfToken();

  const rows = await sql<{
    id: string;
    title: string;
    category: string;
    price: string | null;
    notes: string;
    url: string;
    deleted_at: string | null;
    list_id: string;
    list_title: string;
  }>(
    `select i.id, i.title, i.category, i.price::text as price, i.notes, i.url,
            i.deleted_at::text as deleted_at, i.list_id,
            l.title as list_title
     from items i
     join wish_lists l on l.id = i.list_id
     join wish_list_owners o on o.list_id = l.id
     where o.user_id = $1
       and i.deleted = true
       and i.user_purged = false
     order by i.category, i.deleted_at desc`,
    [user.id],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 20 }}>
          Gifts I Removed
        </h1>
        <p>
          Put it back restores the gift to your list. PURGE removes it from this
          history (cannot undo).
        </p>
        <table className="legacy-table" style={{ maxWidth: 900, marginTop: 12 }}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Removed Date</th>
              <th>Item</th>
              <th>Price</th>
              <th>Comments</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>No removed gifts.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="group-name">{r.category || "—"}</td>
                  <td>{r.deleted_at ? formatMdY(r.deleted_at) : ""}</td>
                  <td>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                    <div style={{ color: "#333" }}>{r.list_title}</div>
                  </td>
                  <td align="right">
                    {r.price != null ? `$${Number(r.price).toFixed(2)}` : ""}
                  </td>
                  <td>{r.notes}</td>
                  <td>
                    <RemovedActions csrf={csrf} itemId={r.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
