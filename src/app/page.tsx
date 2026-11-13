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
          Keep wish lists with your friend circles. When someone marks a gift
          bought, everyone except the list owner can see that it was purchased.
          On the home page, people you can buy for are sorted by upcoming
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
