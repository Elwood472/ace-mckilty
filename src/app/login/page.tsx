import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";
import { safeInternalPath } from "@/lib/urls";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const next = sp.next ? safeInternalPath(sp.next) : "/dashboard";
  if (user) redirect(next);
  const csrf = await ensureCsrfToken();

  return (
    <>
      <SiteHeader user={null} />
      <main className="site-main">
        <p className="brand-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Log In
        </p>
        <p>
          <b>User Name</b> (email) and <b>Password</b>:
        </p>
        <AuthForm
          mode="login"
          csrf={csrf}
          next={next !== "/dashboard" ? next : undefined}
        />
      </main>
    </>
  );
}
