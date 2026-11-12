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
          Add gifts you would like. People who can see your list buy them for you.
          When they mark an item as bought, only the list owner sees the item
          normally — everyone else sees that it has been purchased.
        </p>
        <h3>What are Groups?</h3>
        <p>
          Groups are people who can see each other&apos;s lists. That keeps
          strangers off your list.
        </p>
        <h3>Birthdays &amp; anniversaries</h3>
        <p>
          The home page lists everyone you share a group with, sorted by upcoming
          birthday within each group. Couples (with anniversary dates) appear in
          their own table sorted by upcoming anniversary.
        </p>
        <h3>Put it back / purge</h3>
        <p>
          If you marked something bought by mistake, open <b>Gifts I Bought</b> and
          choose Put it back. Purge removes it from that history list. Owners who
          remove an item can restore it from <b>Gifts I Removed</b>, or purge it
          permanently from that view.
        </p>
        <p>
          <Link href={user ? "/dashboard" : "/"}>← Back</Link>
        </p>
      </main>
    </>
  );
}
