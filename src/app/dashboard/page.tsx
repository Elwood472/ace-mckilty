import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
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
     order by g.created_at desc`,
    [user.id],
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <div className="fade-up mb-10">
          <p className="font-display brand-mark text-4xl text-pine sm:text-5xl">
            Gift Registry
          </p>
          <h1 className="mt-3 text-xl text-muted">Your groups</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section className="surface fade-up-delay rounded-2xl p-6">
            <h2 className="font-display text-2xl text-pine">Groups</h2>
            {groups.length === 0 ? (
              <p className="mt-4 text-muted">
                No groups yet. Create one for a holiday or event, or join with
                an invite code.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[rgba(20,53,44,0.08)]">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/groups/${g.id}`}
                      className="row-hover flex items-center justify-between gap-3 rounded-lg px-2 py-4"
                    >
                      <div>
                        <p className="font-semibold text-ink">{g.name}</p>
                        <p className="text-sm text-muted">
                          {g.member_count} member{g.member_count === 1 ? "" : "s"} · {g.role}
                        </p>
                      </div>
                      <span className="text-amber">Open →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-6 fade-up-delay-2">
            <div className="surface rounded-2xl p-6">
              <h2 className="font-display text-xl text-pine">Create a group</h2>
              <CreateGroupForm csrf={csrf} />
            </div>
            <div className="surface rounded-2xl p-6">
              <h2 className="font-display text-xl text-pine">Join with code</h2>
              <JoinGroupForm csrf={csrf} />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
