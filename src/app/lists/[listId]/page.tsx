import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canViewList, isListOwner } from "@/lib/authz";
import { categoryToc, listVisibleItems } from "@/lib/items";
import { formatMd } from "@/lib/dates";
import type { SortDir, SortKey } from "@/lib/types";
import { ItemTable, ListFilters } from "./list-client";
import {
  DecideRequestForm,
  InviteForm,
  RevokeAccessForm,
} from "./sharing-forms";

type Props = {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function ListPage({ params, searchParams }: Props) {
  const { listId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canViewList(listId, user.id))) notFound();

  const lists = await sql<{
    id: string;
    title: string;
    list_type: string;
    anniversary: string | null;
  }>(
    `select id, title, list_type, anniversary::text as anniversary
     from wish_lists where id = $1`,
    [listId],
  );
  if (!lists.length) notFound();
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

  const viewers = owner
    ? await sql<{ id: string; display_name: string; email: string }>(
        `select u.id, u.display_name, u.email
         from list_access a
         join users u on u.id = a.user_id
         where a.list_id = $1
         order by u.display_name`,
        [listId],
      )
    : [];

  const pending = owner
    ? await sql<{
        id: string;
        display_name: string;
        email: string;
        created_at: string;
      }>(
        `select r.id, u.display_name, u.email, r.created_at::text as created_at
         from list_access_requests r
         join users u on u.id = r.requester_id
         where r.list_id = $1 and r.status = 'pending'
         order by r.created_at asc`,
        [listId],
      )
    : [];

  const invites = owner
    ? await sql<{
        email: string | null;
        token: string;
        created_at: string;
      }>(
        `select email, token, created_at::text as created_at
         from list_invites
         where list_id = $1 and accepted_at is null and expires_at > now()
         order by created_at desc
         limit 8`,
        [listId],
      )
    : [];

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
          <Link href="/dashboard">← Home</Link>
          {owner ? (
            <>
              {" · "}
              <Link href={`/lists/${listId}/add`}>Add a gift</Link>
            </>
          ) : null}
        </p>
        <h1 className="brand-title" style={{ fontSize: 22, marginTop: 8 }}>
          {list.title}
        </h1>
        <p>
          {list.list_type === "together" ? "Together list" : "Personal list"} ·{" "}
          {owners.map((o) => o.display_name).join(", ")}
          {list.anniversary ? ` · Anniversary ${formatMd(list.anniversary)}` : ""}
          {owner
            ? " · You own this list (purchase status is hidden from you)"
            : ""}
        </p>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ flex: "1 1 560px" }}>
            <div className="panel" style={{ width: "100%", marginBottom: 12 }}>
              <div className="panel-head">Categories</div>
              <div style={{ padding: 8 }}>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  <li>
                    <Link href={`/lists/${listId}`}>
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
                          href={`/lists/${listId}?category=${encodeURIComponent(catValue)}`}
                        >
                          {active ? <b>{c.category}</b> : c.category} ({c.count})
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="panel" style={{ width: "100%", marginBottom: 12 }}>
              <div className="panel-head">Filters</div>
              <div style={{ padding: 10 }}>
                <ListFilters
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
                listId={listId}
                sort={sort}
                dir={dir}
              />
            </div>
          </div>

          {owner ? (
            <div style={{ flex: "0 1 300px", minWidth: 260 }}>
              <div className="panel" style={{ marginBottom: 12 }}>
                <div className="panel-head">Invite someone</div>
                <div style={{ padding: 10 }}>
                  <InviteForm csrf={csrf} listId={listId} />
                  {invites.length > 0 ? (
                    <ul style={{ marginTop: 10, paddingLeft: 16, fontSize: 12 }}>
                      {invites.map((i) => (
                        <li key={i.token}>
                          {i.email || "(no email)"} ·{" "}
                          <Link href={`/invite/${i.token}`}>/invite/…</Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="panel" style={{ marginBottom: 12 }}>
                <div className="panel-head">Access requests</div>
                <div style={{ padding: 10 }}>
                  {pending.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                      No pending requests.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                      {pending.map((r) => (
                        <li key={r.id} style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 600 }}>{r.display_name}</div>
                          <div style={{ fontSize: 12, color: "#555" }}>
                            {r.email}
                          </div>
                          <DecideRequestForm csrf={csrf} requestId={r.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">Who can view</div>
                <div style={{ padding: 10 }}>
                  {viewers.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                      Nobody yet — invite or approve a request.
                    </p>
                  ) : (
                    <table className="legacy-table" style={{ width: "100%" }}>
                      <tbody>
                        {viewers.map((v) => (
                          <tr key={v.id}>
                            <td>{v.display_name}</td>
                            <td>
                              <RevokeAccessForm
                                csrf={csrf}
                                listId={listId}
                                userId={v.id}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
