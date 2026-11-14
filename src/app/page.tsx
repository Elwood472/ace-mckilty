import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-kicker" style={{ marginTop: 8 }}>
          Welcome to the
        </p>
        <h1 className="brand-title" style={{ marginTop: 4 }}>
          Ace McKilty Gift Registry
        </h1>
        <p style={{ maxWidth: 560, marginTop: 12 }}>
          Keep a personal wish list and share it with the people you choose —
          invite by email, or let someone request access and approve them. When
          a gift is marked bought, everyone except the list owner can see that
          it was purchased. Home sorts people you can buy for by upcoming
          birthday.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link href="/login" className="btn btn-primary">
            Log In
          </Link>{" "}
          <Link href="/signup" className="btn">
            Create account
          </Link>
        </p>
      </main>
    </>
  );
}
