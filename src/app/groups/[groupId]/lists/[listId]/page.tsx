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

  const budgetRow = await sql<{ amount: string }>(
    "select amount::text as amount from budgets where user_id = $1 and group_id = $2",
    [user.id, groupId],
  );
  const budget = budgetRow[0] ? Number(budgetRow[0].amount) : null;

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
  const useBudget = one(sp.budget) === "1";

  const items = await listVisibleItems(listId, user.id, {
    sort,
    dir,
    category,
    q,
    minPrice,
    maxPrice,
    budget: useBudget ? budget : null,
  });
  const toc = await categoryToc(listId, user.id);

  return (
    <>
      <SiteHeader user={user} />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <div className="fade-up mb-6">
          <Link
            href={`/groups/${groupId}`}
            className="text-sm text-muted hover:text-pine"
          >
            ← {list.title ? "Back to group" : "Group"}
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl text-pine sm:text-5xl">
                {list.title}
              </h1>
              <p className="mt-2 text-muted">
                {list.list_type === "together" ? "Together list" : "Personal list"}{" "}
                · {owners.map((o) => o.display_name).join(", ")}
                {owner
                  ? " · You own this list (purchase status is hidden from you)"
                  : ""}
              </p>
            </div>
            <Link
              href={`/groups/${groupId}/bought`}
              className="btn btn-ghost text-sm"
            >
              Gifts I bought
            </Link>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="surface fade-up-delay h-fit rounded-2xl p-5">
            <h2 className="font-display text-lg text-pine">Categories</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li>
                <Link
                  href={`/groups/${groupId}/lists/${listId}`}
                  className={!category ? "font-semibold text-amber-deep" : "text-muted hover:text-pine"}
                >
                  All ({toc.reduce((n, c) => n + c.count, 0)})
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
                      className={
                        active
                          ? "font-semibold text-amber-deep"
                          : "text-muted hover:text-pine"
                      }
                    >
                      {c.category} ({c.count})
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="space-y-6">
            <div className="surface fade-up-delay rounded-2xl p-5">
              <ListFilters
                groupId={groupId}
                listId={listId}
                sort={sort}
                dir={dir}
                q={q ?? ""}
                minPrice={one(sp.minPrice)}
                maxPrice={one(sp.maxPrice)}
                category={category}
                useBudget={useBudget}
                budget={budget}
              />
            </div>

            <div className="surface fade-up-delay-2 overflow-hidden rounded-2xl">
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

            {owner && (
              <div className="surface fade-up-delay-2 rounded-2xl p-6">
                <h2 className="font-display text-2xl text-pine">Add item</h2>
                <AddItemForm
                  csrf={csrf}
                  listId={listId}
                  members={members}
                />
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
