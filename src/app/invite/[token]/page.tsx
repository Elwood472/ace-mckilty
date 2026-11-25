import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import { AcceptInviteButton } from "./accept-button";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const user = await getCurrentUser();

  // Anonymous visitors always hit the same login redirect — never reveal
  // whether a token is valid before authentication.
  if (!user) {
    const next = `/invite/${encodeURIComponent(token)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Signed-in UI is identical for valid and invalid tokens. Accept validates
  // server-side with a single generic error (no tip-off from page chrome).
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
        <p>
          You&apos;ve been invited to view a wish list. Accept to get access.
          The list opens after you accept.
        </p>
        <div style={{ marginTop: 16 }}>
          <AcceptInviteButton token={token} csrf={csrf} />
        </div>
      </main>
    </>
  );
}
