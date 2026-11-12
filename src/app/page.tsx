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
        <p className="brand-kicker">
          Welcome to the family <span className="brand-title">Gift Registry</span>
        </p>
        <p style={{ maxWidth: 560, marginTop: 12 }}>
          Add gifts you would like. People in your groups can mark them bought —
          everyone except you will see that an item was purchased. Sort people by
          upcoming birthdays and couples by anniversaries on the home page after
          you sign in.
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
