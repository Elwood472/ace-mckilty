import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatMdY } from "@/lib/dates";
import { BoughtActions } from "./bought-actions";

export default async function BoughtPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const csrf = await ensureCsrfToken();

  const rows = await sql<{
    purchase_id: string;
    item_id: string;
    quantity: number;
    created_at: string;
    title: string;
    price: string | null;
    list_title: string;
    list_id: string;
    for_names: string;
  }>(
    `select p.id as purchase_id, p.item_id, p.quantity,
            p.created_at::text as created_at,
            i.title, i.price::text as price, i.list_id,
            l.title as list_title,
            string_agg(u.display_name, ', ' order by u.display_name) as for_names
     from purchases p
     join items i on i.id = p.item_id
     join wish_lists l on l.id = i.list_id
     join wish_list_owners o on o.list_id = l.id
     join users u on u.id = o.user_id
     where p.buyer_user_id = $1 and p.buyer_purged = false
     group by p.id, i.id, l.id
     order by p.created_at desc`,
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
          Gifts I Bought
        </h1>
        <p>
          Put an item back if you change your mind. List owners never see that you
          marked these. Purge clears a row from <i>this</i> list only.
        </p>
        <table className="legacy-table" style={{ maxWidth: 900, marginTop: 12 }}>
          <thead>
            <tr>
              <th>Purchased For</th>
              <th>Purchased Date</th>
              <th>Item</th>
              <th>Price</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>You do not have any &quot;Bought Gifts&quot; to show.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.purchase_id}>
                  <td className="group-name">{r.for_names}</td>
                  <td>{formatMdY(r.created_at)}</td>
                  <td>
                    <Link href={`/lists/${r.list_id}`}>{r.title}</Link>
                    <div style={{ color: "#333" }}>{r.list_title}</div>
                  </td>
                  <td align="right">
                    {r.price != null ? `$${Number(r.price).toFixed(2)}` : ""}
                  </td>
                  <td>
                    <BoughtActions
                      csrf={csrf}
                      itemId={r.item_id}
                      purchaseId={r.purchase_id}
                    />
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
