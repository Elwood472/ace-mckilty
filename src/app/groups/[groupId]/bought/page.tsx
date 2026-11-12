import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isGroupMember } from "@/lib/authz";
import { PutBackForm } from "./bought-client";

type Props = { params: Promise<{ groupId: string }> };

export default async function BoughtPage({ params }: Props) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isGroupMember(groupId, user.id))) notFound();

  const csrf = await ensureCsrfToken();
  const groups = await sql<{ name: string }>(
    "select name from groups where id = $1",
    [groupId],
  );
  if (!groups.length) notFound();

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
     where p.buyer_user_id = $1 and l.group_id = $2
     group by p.id, i.id, l.id
     order by p.created_at desc`,
    [user.id, groupId],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <Link href={`/groups/${groupId}`} className="text-sm text-muted hover:text-pine">
          ← {groups[0].name}
        </Link>
        <h1 className="mt-3 font-display text-4xl text-pine">Gifts I bought</h1>
        <p className="mt-2 text-muted">
          Put an item back if you change your mind — others will see it as available again.
          List owners never see that you marked these.
        </p>

        <div className="surface mt-8 overflow-hidden rounded-2xl">
          {rows.length === 0 ? (
            <p className="p-6 text-muted">You haven&apos;t marked any gifts bought in this group yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-pine text-[#eef6f1]">
                <tr>
                  <th className="px-4 py-3">For</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.purchase_id}
                    className="border-b border-[rgba(20,53,44,0.08)]"
                  >
                    <td className="px-4 py-3 font-semibold">{r.for_names}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/groups/${groupId}/lists/${r.list_id}`}
                        className="text-pine hover:underline"
                      >
                        {r.title}
                      </Link>
                      <p className="text-muted">
                        {r.list_title}
                        {r.price != null ? ` · $${Number(r.price).toFixed(2)}` : ""}
                        {r.quantity > 1 ? ` · qty ${r.quantity}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <PutBackForm csrf={csrf} itemId={r.item_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
