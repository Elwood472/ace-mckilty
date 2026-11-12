import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";
import { ensureCsrfToken } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  if (user) redirect(sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard");
  const csrf = await ensureCsrfToken();

  return (
    <>
      <SiteHeader user={null} />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="mb-8 text-center fade-up">
          <p className="font-display brand-mark text-4xl text-pine">Gift Registry</p>
          <h1 className="mt-3 text-xl text-muted">Welcome back</h1>
        </div>
        <AuthForm mode="login" csrf={csrf} />
      </main>
    </>
  );
}
