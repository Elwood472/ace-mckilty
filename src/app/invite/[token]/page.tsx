import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AcceptInviteButton } from "./accept-button";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const user = await getCurrentUser();

  // Validate the token without selecting list title or invitee email —
  // those must not be shown to arbitrary signed-in visitors.
  const invites = await sql<{
    id: string;
    email: string | null;
  }>(
    `select i.id, i.email
     from list_invites i
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

  const emailMismatch =
    !!invite.email &&
    invite.email.toLowerCase() !== user.email.toLowerCase();

  const csrf = await ensureCsrfToken();

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
          Wish list invite
        </h1>
        {emailMismatch ? (
          <p>
            This invite was sent to a different email address. Sign in with the
            invited account, or ask the owner for a new invite.
          </p>
        ) : (
          <>
            <p>
              You&apos;ve been invited to view a wish list. Accept to get
              access. The list opens after you accept.
            </p>
            <div style={{ marginTop: 16 }}>
              <AcceptInviteButton token={token} csrf={csrf} />
            </div>
          </>
        )}
      </main>
    </>
  );
}
