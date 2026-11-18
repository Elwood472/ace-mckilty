import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/session";

const FAQS: { id: string; q: string; a: ReactNode }[] = [
  {
    id: "how",
    q: "How does this work?",
    a: (
      <>
        Add gifts you would like. Share your list by inviting people, or approve
        access requests from people who look you up by exact email on Home. When
        someone marks a gift bought, only the list owner sees the item normally —
        everyone else sees that it has been purchased.
      </>
    ),
  },
  {
    id: "sharing",
    q: "How do I share my list?",
    a: (
      <>
        There are no friend circles and no name directory. From Home you can
        email an invite link (them seeing your list), or look someone up by{" "}
        <b>exact email</b> and request access to theirs (they must approve).
        Access goes one way — inviting them does not automatically let you see
        their list.
      </>
    ),
  },
  {
    id: "birthdays",
    q: "How do birthdays show up?",
    a: (
      <>
        The home page lists people whose lists you can see, sorted by upcoming
        birthday.
      </>
    ),
  },
  {
    id: "together",
    q: "What are Together lists?",
    a: (
      <>
        Create a shared list for a couple or group gift, with its own owners and
        invite/access rules. An anniversary date is optional metadata on that
        list — not a separate home directory.
      </>
    ),
  },
  {
    id: "filters",
    q: "Can I filter when buying?",
    a: (
      <>
        When viewing someone&apos;s list, filter by price range and by
        store/source (for example Amazon). Source is saved on each item and
        inferred from the URL when possible. There is no saved budget feature.
      </>
    ),
  },
  {
    id: "email",
    q: "What do invite and access-request emails say?",
    a: (
      <>
        Invite emails name the list owner (for example, &ldquo;a wish list
        (Charli Bray)&rdquo;) and include the accept link. When someone requests
        access to your list, owners get an email too.
      </>
    ),
  },
  {
    id: "schedule",
    q: "What does “Show to others starting” mean?",
    a: (
      <>
        When adding a gift, you can set a date when it becomes visible to people
        with access. Leave it blank to show immediately. List owners always see
        their own items.
      </>
    ),
  },
  {
    id: "put-back",
    q: "How do I undo a purchase or restore a gift?",
    a: (
      <>
        If you marked something bought by mistake, open <b>Gifts I Bought</b> and
        choose Put it back. Purge removes it from that history list. Owners who
        remove an item can restore it from <b>Gifts I Removed</b>.
      </>
    ),
  },
];

export default async function FaqPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="site-main faq-page">
        <p>
          <Link href={user ? "/dashboard" : "/"}>← Back</Link>
        </p>
        <h1 className="brand-title faq-title">Frequently Asked Questions</h1>
        <p className="faq-lede">
          Short answers about sharing, buying, and managing gifts. Jump to a
          topic or open any question below.
        </p>

        <nav className="faq-toc" aria-label="FAQ topics">
          <ol>
            {FAQS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.q}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="faq-list">
          {FAQS.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="faq-item"
              open={item.id === "how"}
            >
              <summary>{item.q}</summary>
              <div className="faq-answer">{item.a}</div>
            </details>
          ))}
        </div>
      </main>
    </>
  );
}
