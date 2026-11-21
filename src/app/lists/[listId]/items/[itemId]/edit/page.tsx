import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { requireAppUser } from "@/lib/session";
import { isListOwner } from "@/lib/authz";
import type { Item } from "@/lib/types";
import { EditItemForm } from "../../../list-client";

type Props = {
  params: Promise<{ listId: string; itemId: string }>;
};

export default async function EditGiftPage({ params }: Props) {
  const { listId, itemId } = await params;
  const user = await requireAppUser();
  if (!(await isListOwner(listId, user.id))) notFound();

  const lists = await sql<{ id: string; title: string }>(
    "select id, title from wish_lists where id = $1",
    [listId],
  );
  if (!lists.length) notFound();
  const list = lists[0];

  const items = await sql<Item>(
    `select id, list_id, title, notes, url, price::text as price, category, source,
            quantity, image_url, display_date::text as display_date, restricted,
            created_by, created_at::text as created_at, updated_at::text as updated_at
     from items
     where id = $1 and list_id = $2 and deleted = false`,
    [itemId, listId],
  );
  if (!items.length) notFound();
  const item = items[0];

  const csrf = await ensureCsrfToken();

  const members = await sql<{ id: string; display_name: string }>(
    `select u.id, u.display_name
     from list_access a
     join users u on u.id = a.user_id
     where a.list_id = $1
     order by u.display_name`,
    [listId],
  );

  const viewers = await sql<{ user_id: string }>(
    "select user_id from item_viewers where item_id = $1",
    [itemId],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
          {" · "}
          <Link href={`/lists/${listId}`}>My gifts</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          Edit gift
        </h1>
        <p style={{ color: "#555" }}>
          Editing on <b>{list.title}</b>
        </p>

        <div
          className="panel"
          style={{ width: "100%", maxWidth: 720, marginTop: 12 }}
        >
          <div className="panel-head">Gift details</div>
          <div style={{ padding: 10 }}>
            <EditItemForm
              csrf={csrf}
              listId={listId}
              item={item}
              members={members}
              initialViewerIds={viewers.map((v) => v.user_id)}
            />
          </div>
        </div>
      </main>
    </>
  );
}
