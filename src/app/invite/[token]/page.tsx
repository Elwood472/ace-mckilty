import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AcceptInviteButton } from "./accept-button";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const user = await getCurrentUser();

  const invites = await sql<{
    group_name: string;
    email: string | null;
    expires_at: string;
  }>(
    `select g.name as group_name, i.email, i.expires_at::text as expires_at
     from group_invites i
     join groups g on g.id = i.group_id
     where i.token = $1 and i.accepted_at is null and i.expires_at > now()`,
    [token],
  );

  if (!invites.length) {
    return (
      <>
        <SiteHeader user={user} />
        <main className="relative z-10 mx-auto max-w-lg flex-1 px-5 py-16 text-center">
          <h1 className="font-display text-3xl text-pine">Invite unavailable</h1>
          <p className="mt-3 text-muted">
            This invite is invalid, expired, or already used.
          </p>
          <Link href="/dashboard" className="btn btn-primary mt-6 inline-flex">
            Go to dashboard
          </Link>
        </main>
      </>
    );
  }

  const invite = invites[0];

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  return (
    <>
      <SiteHeader user={user} />
      <main className="relative z-10 mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <p className="font-display brand-mark text-4xl text-pine">Gift Registry</p>
        <h1 className="mt-4 font-display text-2xl text-ink">
          Join {invite.group_name}
        </h1>
        <p className="mt-2 text-muted">
          You&apos;re invited
          {invite.email ? ` as ${invite.email}` : ""}. Accept to join this group
          and get your own wish list.
        </p>
        <div className="mt-8">
          <AcceptInviteButton token={token} />
        </div>
      </main>
    </>
  );
}
