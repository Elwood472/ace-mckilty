import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isGroupMember, isGroupOwner } from "@/lib/authz";
import {
  BudgetForm,
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
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <div className="fade-up mb-8">
          <Link href="/dashboard" className="text-sm text-muted hover:text-pine">
            ← Groups
          </Link>
          <h1 className="mt-2 font-display text-4xl text-pine sm:text-5xl">
            {group.name}
          </h1>
          <p className="mt-2 text-muted">
            Invite code:{" "}
            <code className="rounded bg-white/70 px-2 py-0.5 font-semibold text-ink">
              {group.invite_code}
            </code>
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-8">
            <div className="surface fade-up-delay rounded-2xl p-6">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl text-pine">Wish lists</h2>
                <BudgetForm
                  csrf={csrf}
                  groupId={groupId}
                  amount={budget[0]?.amount ?? ""}
                />
              </div>
              <ul className="divide-y divide-[rgba(20,53,44,0.08)]">
                {lists.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/groups/${groupId}/lists/${l.id}`}
                      className="row-hover flex items-center justify-between gap-3 rounded-lg px-2 py-4"
                    >
                      <div>
                        <p className="font-semibold text-ink">{l.title}</p>
                        <p className="text-sm text-muted">
                          {l.list_type === "together" ? "Together" : "Personal"} ·{" "}
                          {l.owners}
                        </p>
                      </div>
                      <span className="text-amber">View →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface fade-up-delay rounded-2xl p-6">
              <h2 className="font-display text-2xl text-pine">Together list</h2>
              <p className="mt-1 text-sm text-muted">
                Shared list for two or more members (e.g. Mom &amp; Dad).
              </p>
              <TogetherListForm
                csrf={csrf}
                groupId={groupId}
                members={members.filter((m) => m.id !== user.id)}
              />
            </div>
          </section>

          <aside className="space-y-6 fade-up-delay-2">
            <div className="surface rounded-2xl p-6">
              <h2 className="font-display text-xl text-pine">Members</h2>
              <ul className="mt-3 space-y-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-ink">{m.display_name}</p>
                      <p className="text-muted">{m.role}</p>
                    </div>
                    {owner && m.id !== user.id && (
                      <MemberRemoveForm
                        csrf={csrf}
                        groupId={groupId}
                        userId={m.id}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {!owner && (
                <LeaveForm csrf={csrf} groupId={groupId} />
              )}
            </div>

            <div className="surface rounded-2xl p-6">
              <h2 className="font-display text-xl text-pine">Find people</h2>
              <UserSearchPanel csrf={csrf} groupId={groupId} />
            </div>

            <div className="surface rounded-2xl p-6">
              <h2 className="font-display text-xl text-pine">Invites</h2>
              <InviteForms csrf={csrf} groupId={groupId} />
              {invites.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {invites.map((inv) => (
                    <li key={inv.id} className="rounded-lg bg-white/60 px-3 py-2">
                      <p className="font-medium text-ink">
                        {inv.email ?? "Open invite"}
                      </p>
                      <p className="break-all text-muted">/invite/{inv.token}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
