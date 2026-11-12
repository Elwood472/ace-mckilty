import Link from "next/link";
import type { User } from "@/lib/types";
import { signOut } from "@/app/actions/auth";

export function SiteHeader({ user }: { user: User | null }) {
  return (
    <header className="relative z-10 border-b border-[rgba(20,53,44,0.08)] bg-[rgba(238,243,240,0.75)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href={user ? "/dashboard" : "/"} className="group">
          <span className="font-display brand-mark text-2xl text-pine transition-colors group-hover:text-moss">
            Gift Registry
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-muted sm:inline">
                {user.display_name}
              </span>
              <Link href="/dashboard" className="btn btn-ghost py-2 text-sm">
                Groups
              </Link>
              <form action={signOut}>
                <button type="submit" className="btn btn-ghost py-2 text-sm">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost py-2 text-sm">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary py-2 text-sm">
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
