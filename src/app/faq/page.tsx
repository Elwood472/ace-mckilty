import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/session";

export default async function FaqPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main" style={{ maxWidth: 720 }}>
        <h1 className="brand-title" style={{ fontSize: 22 }}>
          Frequently Asked Questions
        </h1>
        <h3>How does this work?</h3>
        <p>
          Add gifts you would like. Friends in your circles can mark them bought.
          When they do, only the list owner sees the item normally — everyone
          else sees that it has been purchased.
        </p>
        <h3>What are friend circles?</h3>
        <p>
          Circles are groups of people who can see each other&apos;s lists — family
          or close friends, not separate occasion lists. One circle covers
          birthdays, holidays, and everything else.
        </p>
        <h3>Birthdays</h3>
        <p>
          The home page lists everyone you share a circle with, sorted by
          upcoming birthday within each circle.
        </p>
        <h3>Together lists</h3>
        <p>
          Create a shared list for a couple or group gift. An anniversary date is
          optional metadata on that list.
        </p>
        <h3>Filters when buying</h3>
        <p>
          When viewing someone&apos;s list, filter by price range and by store/source
          (for example Amazon). Source is saved on each item and inferred from
          the URL when possible.
        </p>
        <h3>Invites</h3>
        <p>
          Email an invite link from a circle&apos;s invite panel. Live email needs
          the <code>RESEND_API_KEY</code> secret; otherwise the invite is still
          created and the link is shown on screen.
        </p>
        <h3>Put it back / purge</h3>
        <p>
          If you marked something bought by mistake, open <b>Gifts I Bought</b> and
          choose Put it back. Purge removes it from that history list. Owners who
          remove an item can restore it from <b>Gifts I Removed</b>.
        </p>
        <p>
          <Link href={user ? "/dashboard" : "/"}>← Back</Link>
        </p>
      </main>
    </>
  );
}
