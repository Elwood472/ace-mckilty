import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { HomeToolbar } from "@/components/home-toolbar";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { activityClass, formatMd, formatMdY } from "@/lib/dates";
import { listPeopleToBuyFor } from "@/lib/people";
import { ensurePersonalList } from "@/lib/lists";
import {
  CreateTogetherForm,
  DecideRequestForm,
  InviteMyListForm,
  SearchPeoplePanel,
} from "./forms";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const csrf = await ensureCsrfToken();
  const myListId = await ensurePersonalList(user.id, user.display_name);

  const people = await listPeopleToBuyFor(user.id);

  const incoming = await sql<{
    id: string;
    display_name: string;
    email: string;
    list_title: string;
    list_id: string;
  }>(
    `select r.id, u.display_name, u.email, l.title as list_title, l.id as list_id
     from list_access_requests r
     join wish_lists l on l.id = r.list_id
     join wish_list_owners o on o.list_id = l.id and o.user_id = $1
     join users u on u.id = r.requester_id
     where r.status = 'pending'
     order by r.created_at asc`,
    [user.id],
  );

  const together = await sql<{
    id: string;
    title: string;
    anniversary: string | null;
    owners: string;
  }>(
    `select l.id, l.title, l.anniversary::text as anniversary,
            string_agg(u.display_name, ', ' order by u.display_name) as owners
     from wish_lists l
     join wish_list_owners o on o.list_id = l.id
     join users u on u.id = o.user_id
     where l.list_type = 'together'
       and (
         exists (select 1 from wish_list_owners wo where wo.list_id = l.id and wo.user_id = $1)
         or exists (select 1 from list_access a where a.list_id = l.id and a.user_id = $1)
       )
     group by l.id
     order by l.title`,
    [user.id],
  );

  // Co-owner candidates: people whose lists I can see, or who can see mine
  const candidates = await sql<{ id: string; display_name: string }>(
    `select distinct u.id, u.display_name
     from users u
     where u.id <> $1
       and (
         exists (
           select 1 from list_access a
           join wish_lists l on l.id = a.list_id and l.list_type = 'personal'
           join wish_list_owners o on o.list_id = l.id and o.user_id = u.id
           where a.user_id = $1
         )
         or exists (
           select 1 from list_access a
           where a.list_id = $2 and a.user_id = u.id
         )
       )
     order by u.display_name`,
    [user.id, myListId],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p className="brand-kicker">
          <span className="brand-title" style={{ fontSize: 22 }}>
            Ace McKilty Gift Registry
          </span>{" "}
          — Home
        </p>

        <HomeToolbar myListId={myListId} userId={user.id} />

        <h2
          style={{
            color: "#000080",
            marginTop: 28,
            marginBottom: 8,
            fontSize: 16,
          }}
        >
          People you can buy for
          <span style={{ fontWeight: 400, fontSize: 12, color: "#333" }}>
            {" "}
            — lists you have access to, sorted by upcoming birthday
          </span>
        </h2>

        {people.length === 0 ? (
          <p>
            Nobody yet. Invite someone to your list, or search for a person and
            request access to theirs.
          </p>
        ) : (
          <table className="legacy-table" style={{ maxWidth: 980 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th></th>
                <th>Birthday</th>
                <th>Days</th>
                <th>Last Item Added</th>
                <th>Last Item Modified</th>
                <th>Last Item Removed</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.user_id}>
                  <td>
                    <Link href={`/lists/${p.personal_list_id}`}>
                      {p.display_name}
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={`/profile/${p.user_id}`}
                      title={
                        p.profile_modified_at
                          ? `Profile last modified: ${formatMdY(p.profile_modified_at)}`
                          : "Profile"
                      }
                    >
                      Profile
                    </Link>
                  </td>
                  <td align="right">{formatMd(p.birthday)}</td>
                  <td align="right">
                    {p.days_until_birthday != null
                      ? p.days_until_birthday
                      : "—"}
                  </td>
                  <td align="right" className={activityClass(p.last_added)}>
                    {p.last_added ? formatMdY(p.last_added) : ""}
                  </td>
                  <td align="right" className={activityClass(p.last_modified)}>
                    {p.last_modified ? formatMdY(p.last_modified) : ""}
                  </td>
                  <td align="right" className={activityClass(p.last_removed)}>
                    {p.last_removed ? formatMdY(p.last_removed) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {incoming.length > 0 ? (
          <>
            <h2
              style={{
                color: "#000080",
                marginTop: 28,
                marginBottom: 8,
                fontSize: 16,
              }}
            >
              Access requests for your lists
            </h2>
            <table className="legacy-table" style={{ maxWidth: 720 }}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>List</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {incoming.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.display_name}
                      <div style={{ fontSize: 12, color: "#555" }}>{r.email}</div>
                    </td>
                    <td>
                      <Link href={`/lists/${r.list_id}`}>{r.list_title}</Link>
                    </td>
                    <td>
                      <DecideRequestForm csrf={csrf} requestId={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <h2
          style={{
            color: "#000080",
            marginTop: 28,
            marginBottom: 8,
            fontSize: 16,
          }}
        >
          Together lists
        </h2>
        <table className="legacy-table" style={{ maxWidth: 720, marginBottom: 12 }}>
          <thead>
            <tr>
              <th>List</th>
              <th>Owners</th>
              <th>Anniversary</th>
            </tr>
          </thead>
          <tbody>
            {together.length === 0 ? (
              <tr>
                <td colSpan={3}>No together lists yet.</td>
              </tr>
            ) : (
              together.map((t) => (
                <tr key={t.id}>
                  <td className="group-name">
                    <Link href={`/lists/${t.id}`}>{t.title}</Link>
                  </td>
                  <td>{t.owners}</td>
                  <td>{t.anniversary ? formatMd(t.anniversary) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 280px" }}>
            <div className="panel-head">Invite someone to my list</div>
            <div style={{ padding: 10 }}>
              <InviteMyListForm csrf={csrf} listId={myListId} />
            </div>
          </div>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 280px" }}>
            <div className="panel-head">Find a person</div>
            <div style={{ padding: 10 }}>
              <SearchPeoplePanel csrf={csrf} />
            </div>
          </div>
          <div className="panel" style={{ minWidth: 280, flex: "1 1 280px" }}>
            <div className="panel-head">Create together list</div>
            <div style={{ padding: 10 }}>
              <CreateTogetherForm csrf={csrf} candidates={candidates} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
