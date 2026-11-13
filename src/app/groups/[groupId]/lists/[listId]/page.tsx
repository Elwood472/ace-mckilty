import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isGroupMember, isListOwner } from "@/lib/authz";
import { categoryToc, listVisibleItems } from "@/lib/items";
import type { SortDir, SortKey } from "@/lib/types";
import { AddItemForm, ItemTable, ListFilters } from "./list-client";

type Props = {
  params: Promise<{ groupId: string; listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function ListPage({ params, searchParams }: Props) {
  const { groupId, listId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isGroupMember(groupId, user.id))) notFound();

  const lists = await sql<{
    id: string;
    title: string;
    list_type: string;
    group_id: string;
  }>("select id, title, list_type, group_id from wish_lists where id = $1", [
    listId,
  ]);
  if (!lists.length || lists[0].group_id !== groupId) notFound();
  const list = lists[0];

  const owners = await sql<{ id: string; display_name: string }>(
    `select u.id, u.display_name
     from wish_list_owners o
     join users u on u.id = o.user_id
     where o.list_id = $1
     order by u.display_name`,
    [listId],
  );

  const owner = await isListOwner(listId, user.id);
  const csrf = await ensureCsrfToken();

  const ownerIdSet = new Set(owners.map((o) => o.id));
  const allMembers = await sql<{ id: string; display_name: string }>(
    `select u.id, u.display_name
     from group_members gm
     join users u on u.id = gm.user_id
     where gm.group_id = $1
     order by u.display_name`,
    [groupId],
  );
  const members = allMembers.filter((m) => !ownerIdSet.has(m.id));

  const sort = (one(sp.sort) || "title") as SortKey;
  const dir = (one(sp.dir) || "asc") as SortDir;
  const categoryParam = one(sp.category);
  const category =
    categoryParam === ""
      ? null
      : categoryParam === "__none__"
        ? ""
        : categoryParam || null;
  const q = one(sp.q) || null;
  const minPrice = one(sp.minPrice) ? Number(one(sp.minPrice)) : null;
  const maxPrice = one(sp.maxPrice) ? Number(one(sp.maxPrice)) : null;
  const source = one(sp.source);

  const items = await listVisibleItems(listId, user.id, {
    sort,
    dir,
    category,
    q,
    minPrice,
    maxPrice,
    source: source || null,
  });
  const toc = await categoryToc(listId, user.id);

  const sourceRows = await sql<{ source: string }>(
    `select distinct source from items
     where list_id = $1 and deleted = false and source <> ''
     order by source`,
    [listId],
  );
  const sources = sourceRows.map((r) => r.source);

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href={`/groups/${groupId}`}>← Back to circle</Link>
          {" · "}
          <Link href="/dashboard">Home</Link>
          {" · "}
          <Link href="/bought">View Gifts I Bought</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          {list.title}
        </h1>
        <p>
          {list.list_type === "together" ? "Together list" : "Personal list"} ·{" "}
          {owners.map((o) => o.display_name).join(", ")}
          {owner
            ? " · You own this list (purchase status is hidden from you)"
            : ""}
        </p>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14 }}>
          <div className="panel" style={{ minWidth: 180 }}>
            <div className="panel-head">Categories</div>
            <div style={{ padding: 8 }}>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>
                  <Link href={`/groups/${groupId}/lists/${listId}`}>
                    {!category ? <b>All</b> : "All"} (
                    {toc.reduce((n, c) => n + c.count, 0)})
                  </Link>
                </li>
                {toc.map((c) => {
                  const catValue =
                    c.category === "Uncategorized" ? "__none__" : c.category;
                  const active =
                    (c.category === "Uncategorized" && category === "") ||
                    category === c.category;
                  return (
                    <li key={c.category}>
                      <Link
                        href={`/groups/${groupId}/lists/${listId}?category=${encodeURIComponent(catValue)}`}
                      >
                        {active ? <b>{c.category}</b> : c.category} ({c.count})
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div style={{ flex: "1 1 560px" }}>
            <div className="panel" style={{ width: "100%", marginBottom: 12 }}>
              <div className="panel-head">Filters</div>
              <div style={{ padding: 10 }}>
                <ListFilters
                  groupId={groupId}
                  listId={listId}
                  sort={sort}
                  dir={dir}
                  q={q ?? ""}
                  minPrice={one(sp.minPrice)}
                  maxPrice={one(sp.maxPrice)}
                  category={category}
                  source={source}
                  sources={sources}
                />
              </div>
            </div>

            <div className="panel" style={{ width: "100%", marginBottom: 12 }}>
              <div className="panel-head">Gifts</div>
              <ItemTable
                items={items}
                owner={owner}
                csrf={csrf}
                groupId={groupId}
                listId={listId}
                sort={sort}
                dir={dir}
              />
            </div>

            {owner ? (
              <div className="panel" style={{ width: "100%" }}>
                <div className="panel-head">Add a New Gift</div>
                <div style={{ padding: 10 }}>
                  <AddItemForm csrf={csrf} listId={listId} members={members} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
