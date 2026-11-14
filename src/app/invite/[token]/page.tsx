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
    list_title: string;
    email: string | null;
    expires_at: string;
  }>(
    `select l.title as list_title, i.email, i.expires_at::text as expires_at
     from list_invites i
     join wish_lists l on l.id = i.list_id
     where i.token = $1 and i.accepted_at is null and i.expires_at > now()`,
    [token],
  );

  if (!invites.length) {
    return (
      <>
        <SiteHeader user={user} />
        <main className="site-main" style={{ maxWidth: 480 }}>
          <h1 className="brand-title" style={{ fontSize: 22 }}>
            Invite unavailable
          </h1>
          <p>This invite is invalid, expired, or already used.</p>
          <Link href="/dashboard" className="btn btn-primary">
            Go to home
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
      <main className="site-main" style={{ maxWidth: 480 }}>
        <p className="brand-kicker">
          <span className="brand-title" style={{ fontSize: 22 }}>
            Ace McKilty Gift Registry
          </span>
        </p>
        <h1 style={{ color: "#000080", fontSize: 20, marginTop: 12 }}>
          View {invite.list_title}
        </h1>
        <p>
          You&apos;re invited
          {invite.email ? ` as ${invite.email}` : ""} to see this wish list.
          Accept to get access.
        </p>
        <div style={{ marginTop: 16 }}>
          <AcceptInviteButton token={token} />
        </div>
      </main>
    </>
  );
}
