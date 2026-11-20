import Link from "next/link";
import type { User } from "@/lib/types";
import { signOut } from "@/app/actions/auth";
import { CsrfField } from "@/components/csrf-field";
import { QuietWaves } from "@/components/quiet-waves";
import { ensureCsrfToken } from "@/lib/csrf";
import { pickHeaderBanner } from "@/lib/header-banner";

/**
 * Gift Registry chrome under Ace McKilty.
 * Brand mark links to the public hub (`/`); Gift Registry home is `/gifts` or `/dashboard`.
 *
 * Header art: small transparent cutout on the header/page border.
 * Random from the default pool; holiday sets override when they have images.
 */
export async function SiteHeader({
  user,
  app = "gifts",
}: {
  user: User | null;
  /** Which Ace McKilty app this page belongs to (chrome label). */
  app?: "gifts";
}) {
  const giftsHome = user ? "/dashboard" : "/gifts";
  const csrf = user ? await ensureCsrfToken() : "";
  const banner = pickHeaderBanner();

  return (
    <>
      <QuietWaves />
      <header className="site-header">
        <div className="site-header-row">
          <div className="site-header-brand">
            <Link
              href="/"
              aria-label="Ace McKilty home"
              style={{ textDecoration: "none" }}
            >
              <div
                aria-hidden
                style={{
                  width: 40,
                  height: 40,
                  background: "var(--navy)",
                  border: "1px solid #000",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  textAlign: "center",
                  lineHeight: "40px",
                }}
              >
                AM
              </div>
            </Link>
            <div style={{ lineHeight: 1.2 }}>
              <Link
                href="/"
                className="brand-title"
                style={{ fontSize: 18, display: "block" }}
              >
                Ace McKilty
              </Link>
              {app === "gifts" ? (
                <Link
                  href={giftsHome}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--navy)",
                    textDecoration: "none",
                  }}
                >
                  Gift Registry
                </Link>
              ) : null}
            </div>
          </div>

          <div
            className="site-header-banner"
            aria-hidden="true"
            style={{
              justifySelf: "center",
              width: "min(100%, 280px)",
              height: 72,
              maxHeight: 72,
              overflow: "hidden",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {/* Hard size caps — must not depend on CSS bundle alone */}
            <img
              src={banner.src}
              alt=""
              width={280}
              height={72}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: 72,
                width: "auto",
                height: "auto",
                objectFit: "contain",
                objectPosition: "center bottom",
              }}
            />
          </div>

          <div className="site-header-nav">
            {user ? (
              <span>
                <b>{user.display_name}</b>
                {" · "}
                <Link href="/">Site</Link>
                {" · "}
                <Link href="/dashboard">Home</Link>
                {" · "}
                <Link href="/profile/security">Security</Link>
                {" · "}
                <Link href="/faq">FAQ</Link>
                {" · "}
                <form action={signOut} style={{ display: "inline" }}>
                  <CsrfField token={csrf} />
                  <button
                    type="submit"
                    className="btn"
                    style={{ marginLeft: 4 }}
                  >
                    Log Out
                  </button>
                </form>
              </span>
            ) : (
              <span>
                <Link href="/">Site</Link>
                {" · "}
                <Link href="/faq">FAQ</Link>
                {" · "}
                <Link href="/login">Sign in</Link>
                {" · "}
                <Link href="/signup">Create account</Link>
              </span>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
