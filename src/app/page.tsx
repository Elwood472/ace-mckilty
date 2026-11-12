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
      <main className="relative z-10 flex flex-1 flex-col">
        <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-6xl flex-col justify-center px-5 py-16">
          <div
            className="pointer-events-none absolute inset-y-8 right-0 hidden w-[48%] overflow-hidden rounded-l-[2.5rem] md:block"
            aria-hidden
          >
            <div className="h-full w-full bg-[linear-gradient(145deg,#14352c_0%,#2f6b55_48%,#c8892d_130%)] opacity-95" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(0,0,0,0.18),transparent_50%)]" />
            <div className="absolute bottom-10 left-10 right-10 text-[#eef6f1]">
              <p className="font-display text-3xl leading-tight">
                Wish quietly.
                <br />
                Give generously.
              </p>
            </div>
          </div>

          <div className="relative max-w-xl">
            <p className="fade-up font-display brand-mark text-5xl leading-[0.95] tracking-tight text-pine sm:text-6xl md:text-7xl">
              Gift Registry
            </p>
            <h1 className="fade-up-delay mt-6 max-w-md font-display text-2xl leading-snug text-ink sm:text-3xl">
              Family wish lists with secret purchases.
            </h1>
            <p className="fade-up-delay-2 mt-4 max-w-md text-lg leading-relaxed text-muted">
              Mark a gift bought without tipping off the list owner. Share
              groups, together lists, budgets, and privacy cues — all in one
              place.
            </p>
            <div className="fade-up-delay-2 mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-amber">
                Create account
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
