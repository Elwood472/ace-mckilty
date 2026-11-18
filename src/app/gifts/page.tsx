import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Gift Registry",
  description:
    "Wish lists with secret purchases — mark gifts bought without tipping off the owner.",
};

/** Gift Registry app gateway under Ace McKilty. */
export default async function GiftsHomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <SiteHeader user={null} app="gifts" />
      <main className="site-main">
        <p className="brand-kicker" style={{ marginTop: 8 }}>
          Ace McKilty · Gift Registry
        </p>
        <h1 className="brand-title" style={{ fontSize: 26, marginTop: 4 }}>
          Gift Registry
        </h1>
        <p style={{ maxWidth: 560, marginTop: 12 }}>
          Keep a personal wish list and share it with the people you choose —
          invite by email. When a gift is marked bought, everyone except the
          list owner can see that it was purchased. Home sorts people you can
          buy for by upcoming birthday.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link href="/login" className="btn btn-primary">
            Log In
          </Link>{" "}
          <Link href="/signup" className="btn">
            Create account
          </Link>
        </p>
        <p style={{ marginTop: 20, fontSize: 12 }}>
          <Link href="/">← Ace McKilty home</Link>
        </p>
      </main>
    </>
  );
}
