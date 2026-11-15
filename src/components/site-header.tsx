import Link from "next/link";
import type { User } from "@/lib/types";
import { signOut } from "@/app/actions/auth";
import { shouldShowImportLink } from "@/lib/import-nav";

/**
 * Gift Registry chrome under Ace McKilty.
 * Brand mark links to the public hub (`/`); Gift Registry home is `/gifts` or `/dashboard`.
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
  const showImport = user ? await shouldShowImportLink(user.id) : false;

  return (
    <header className="site-header">
      <table cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            <td valign="middle" style={{ width: 48 }}>
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
                    background: "#000080",
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
            </td>
            <td valign="middle">
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
                      color: "#000080",
                      textDecoration: "none",
                    }}
                  >
                    Gift Registry
                  </Link>
                ) : null}
              </div>
            </td>
            <td valign="middle" align="right">
              {user ? (
                <span style={{ fontSize: 12 }}>
                  {user.display_name}
                  {" · "}
                  <Link href="/">Site</Link>
                  {" · "}
                  <Link href="/dashboard">Home</Link>
                  {" · "}
                  <Link href="/faq">FAQ</Link>
                  {showImport ? (
                    <>
                      {" · "}
                      <Link href="/import-data">Import</Link>
                    </>
                  ) : null}
                  {" · "}
                  <form action={signOut} style={{ display: "inline" }}>
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
                <span style={{ fontSize: 12 }}>
                  <Link href="/">Site</Link>
                  {" · "}
                  <Link href="/faq">FAQ</Link>
                  {" · "}
                  <Link href="/login">Sign in</Link>
                  {" · "}
                  <Link href="/signup">Create account</Link>
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </header>
  );
}
