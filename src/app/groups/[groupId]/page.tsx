import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isGroupMember, isGroupOwner } from "@/lib/authz";
import {
  BudgetForm,
  CoupleForm,
  InviteForms,
  LeaveForm,
  MemberRemoveForm,
  TogetherListForm,
  UserSearchPanel,
} from "./group-forms";

type Props = { params: Promise<{ groupId: string }> };

export default async function GroupPage({ params }: Props) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isGroupMember(groupId, user.id))) notFound();

  const csrf = await ensureCsrfToken();
  const owner = await isGroupOwner(groupId, user.id);

  const groups = await sql<{
    id: string;
    name: string;
    invite_code: string;
    owner_id: string;
  }>("select id, name, invite_code, owner_id from groups where id = $1", [
    groupId,
  ]);
  if (!groups.length) notFound();
  const group = groups[0];

  const members = await sql<{
    id: string;
    display_name: string;
    email: string;
    role: string;
  }>(
    `select u.id, u.display_name, u.email, gm.role
     from group_members gm
     join users u on u.id = gm.user_id
     where gm.group_id = $1
     order by gm.role desc, u.display_name`,
    [groupId],
  );

  const lists = await sql<{
    id: string;
    title: string;
    list_type: string;
    owners: string;
  }>(
    `select l.id, l.title, l.list_type,
            string_agg(u.display_name, ', ' order by u.display_name) as owners
     from wish_lists l
     join wish_list_owners o on o.list_id = l.id
     join users u on u.id = o.user_id
     where l.group_id = $1
     group by l.id
     order by l.list_type, l.title`,
    [groupId],
  );

  const invites = await sql<{
    id: string;
    email: string | null;
    token: string;
    expires_at: string;
  }>(
    `select id, email, token, expires_at::text as expires_at
     from group_invites
     where group_id = $1 and accepted_at is null and expires_at > now()
     order by created_at desc
     limit 10`,
    [groupId],
  );

  const budget = await sql<{ amount: string }>(
    "select amount::text as amount from budgets where user_id = $1 and group_id = $2",
    [user.id, groupId],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main">
        <p>
          <Link href="/dashboard">← Home</Link>
        </p>
        <h1 className="brand-title" style={{ fontSize: 22 }}>
          {group.name}
        </h1>
        <p>
          Invite code: <b>{group.invite_code}</b>
          {" · "}
          <Link href="/bought">Gifts I Bought</Link>
        </p>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ flex: "1 1 420px" }}>
            <div className="panel" style={{ width: "100%", marginBottom: 16 }}>
              <div className="panel-head">Wish lists</div>
              <div style={{ padding: 10 }}>
                <BudgetForm
                  csrf={csrf}
                  groupId={groupId}
                  amount={budget[0]?.amount ?? ""}
                />
                <table className="legacy-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>List</th>
                      <th>Type</th>
                      <th>Owners</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lists.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <Link href={`/groups/${groupId}/lists/${l.id}`}>
                            {l.title}
                          </Link>
                        </td>
                        <td>{l.list_type === "together" ? "Together" : "Personal"}</td>
                        <td>{l.owners}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel" style={{ width: "100%", marginBottom: 16 }}>
              <div className="panel-head">Couple + anniversary</div>
              <div style={{ padding: 10 }}>
                <p style={{ marginTop: 0 }}>
                  Creates a couple row on the home page (sorted by upcoming
                  anniversary) and a together list if needed.
                </p>
                <CoupleForm csrf={csrf} groupId={groupId} members={members} />
              </div>
            </div>

            <div className="panel" style={{ width: "100%" }}>
              <div className="panel-head">Together list (2+ owners)</div>
              <div style={{ padding: 10 }}>
                <TogetherListForm
                  csrf={csrf}
                  groupId={groupId}
                  members={members.filter((m) => m.id !== user.id)}
                />
              </div>
            </div>
          </div>

          <div style={{ flex: "0 1 320px" }}>
            <div className="panel" style={{ width: "100%", marginBottom: 16 }}>
              <div className="panel-head">Members</div>
              <div style={{ padding: 10 }}>
                <table className="legacy-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <Link href={`/profile/${m.id}`}>{m.display_name}</Link>
                        </td>
                        <td>{m.role}</td>
                        <td>
                          {owner && m.id !== user.id ? (
                            <MemberRemoveForm
                              csrf={csrf}
                              groupId={groupId}
                              userId={m.id}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!owner ? <LeaveForm csrf={csrf} groupId={groupId} /> : null}
              </div>
            </div>

            <div className="panel" style={{ width: "100%", marginBottom: 16 }}>
              <div className="panel-head">Find people</div>
              <div style={{ padding: 10 }}>
                <UserSearchPanel csrf={csrf} groupId={groupId} />
              </div>
            </div>

            <div className="panel" style={{ width: "100%" }}>
              <div className="panel-head">Invites</div>
              <div style={{ padding: 10 }}>
                <InviteForms csrf={csrf} groupId={groupId} />
                {invites.length > 0 ? (
                  <ul style={{ paddingLeft: 18 }}>
                    {invites.map((inv) => (
                      <li key={inv.id}>
                        {inv.email ?? "Open invite"} — /invite/{inv.token}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
