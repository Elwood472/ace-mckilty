import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { activityClass, formatMd, formatMdY } from "@/lib/dates";
import { listPeopleToBuyFor } from "@/lib/people";
import { CreateGroupForm, JoinGroupForm } from "./forms";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const csrf = await ensureCsrfToken();

  const groups = await sql<{
    id: string;
    name: string;
    role: string;
    member_count: number;
  }>(
    `select g.id, g.name, gm.role,
            (select count(*)::int from group_members m where m.group_id = g.id) as member_count
     from groups g
     join group_members gm on gm.group_id = g.id
     where gm.user_id = $1
     order by g.name`,
    [user.id],
  );

  const myList = await sql<{ id: string; group_id: string }>(
    `select l.id, l.group_id from wish_lists l
     join wish_list_owners o on o.list_id = l.id
     where o.user_id = $1 and l.list_type = 'personal'
     order by l.created_at desc
     limit 1`,
    [user.id],
  );

  const people = await listPeopleToBuyFor(user.id);
  let prevGroup = "";

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p className="brand-kicker">
          <span className="brand-title">Gift Registry</span> — Home
        </p>

        <table
          className="my-functions"
          cellPadding={0}
          cellSpacing={0}
          style={{ marginTop: 12 }}
        >
          <tbody>
            <tr className="head">
              <td colSpan={2}>My Functions</td>
            </tr>
            <tr>
              <td>
                <Link href="/profile/edit" className="btn">
                  Edit My Profile
                </Link>
              </td>
              <td>
                <Link href={`/profile/${user.id}`} className="btn">
                  View My Profile
                </Link>
              </td>
            </tr>
            <tr>
              <td>
                {myList[0] ? (
                  <Link
                    href={`/groups/${myList[0].group_id}/lists/${myList[0].id}`}
                    className="btn"
                  >
                    Add a New Gift
                  </Link>
                ) : (
                  <span style={{ color: "#666" }}>
                    Join a friend circle to add gifts
                  </span>
                )}
              </td>
              <td>
                {myList[0] ? (
                  <Link
                    href={`/groups/${myList[0].group_id}/lists/${myList[0].id}`}
                    className="btn"
                  >
                    View My Gifts
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
            <tr>
              <td>
                <Link href="/bought" className="btn">
                  View Gifts I Bought
                </Link>
              </td>
              <td>
                <Link href="/removed" className="btn">
                  View Gifts I Removed
                </Link>
              </td>
            </tr>
          </tbody>
        </table>

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
            — friends in your circles, sorted by upcoming birthday
          </span>
        </h2>

        {people.length === 0 ? (
          <p>
            No one else in your circles yet. Create or join a friend circle
            below.
          </p>
        ) : (
          <table className="legacy-table" style={{ maxWidth: 980 }}>
            <thead>
              <tr>
                <th>Circle</th>
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
              {people.map((p) => {
                const showGroup = p.group_name !== prevGroup;
                const breakRow = Boolean(prevGroup && showGroup);
                prevGroup = p.group_name;
                return (
                  <Fragment key={`${p.group_id}-${p.user_id}`}>
                    {breakRow ? (
                      <tr className="group-break">
                        <td colSpan={8}></td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="group-name">
                        {showGroup ? p.group_name : ""}
                      </td>
                      <td>
                        {p.personal_list_id ? (
                          <Link
                            href={`/groups/${p.group_id}/lists/${p.personal_list_id}`}
                          >
                            {p.display_name}
                          </Link>
                        ) : (
                          p.display_name
                        )}
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
                      <td
                        align="right"
                        className={activityClass(p.last_added)}
                      >
                        {p.last_added ? formatMdY(p.last_added) : ""}
                      </td>
                      <td
                        align="right"
                        className={activityClass(p.last_modified)}
                      >
                        {p.last_modified ? formatMdY(p.last_modified) : ""}
                      </td>
                      <td
                        align="right"
                        className={activityClass(p.last_removed)}
                      >
                        {p.last_removed ? formatMdY(p.last_removed) : ""}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        <h2
          style={{
            color: "#000080",
            marginTop: 28,
            marginBottom: 8,
            fontSize: 16,
          }}
        >
          Your friend circles
        </h2>
        <table className="legacy-table" style={{ maxWidth: 640, marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Circle</th>
              <th>Members</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={4}>No friend circles yet.</td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.id}>
                  <td className="group-name">{g.name}</td>
                  <td align="right">{g.member_count}</td>
                  <td>{g.role}</td>
                  <td>
                    <Link href={`/groups/${g.id}`}>Open</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="panel" style={{ minWidth: 280 }}>
            <div className="panel-head">Create a friend circle</div>
            <div style={{ padding: 10 }}>
              <CreateGroupForm csrf={csrf} />
            </div>
          </div>
          <div className="panel" style={{ minWidth: 280 }}>
            <div className="panel-head">Join with invite code</div>
            <div style={{ padding: 10 }}>
              <JoinGroupForm csrf={csrf} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
