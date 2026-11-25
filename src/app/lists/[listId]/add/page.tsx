import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { requireAppUser } from "@/lib/session";
import { canEditListItems } from "@/lib/authz";
import { AddItemForm } from "../list-client";

type Props = { params: Promise<{ listId: string }> };

export default async function AddGiftPage({ params }: Props) {
  const { listId } = await params;
  const user = await requireAppUser();
  if (!(await canEditListItems(listId, user.id))) notFound();

  const lists = await sql<{ id: string; title: string }>(
    "select id, title from wish_lists where id = $1",
    [listId],
  );
  if (!lists.length) notFound();
  const list = lists[0];
  const csrf = await ensureCsrfToken();

  const viewers = await sql<{ id: string; display_name: string }>(
    `select u.id, u.display_name
     from list_access a
     join users u on u.id = a.user_id
     where a.list_id = $1
     order by u.display_name`,
    [listId],
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
          Add a gift
        </h1>
        <p style={{ color: "#555" }}>
          Adding to <b>{list.title}</b>
        </p>

        <div className="panel" style={{ width: "100%", maxWidth: 720, marginTop: 12 }}>
          <div className="panel-head">New gift</div>
          <div style={{ padding: 10 }}>
            <AddItemForm csrf={csrf} listId={listId} members={viewers} />
          </div>
        </div>
      </main>
    </>
  );
}
