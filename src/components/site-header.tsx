import Link from "next/link";
import type { User } from "@/lib/types";
import { signOut } from "@/app/actions/auth";

export function SiteHeader({ user }: { user: User | null }) {
  return (
    <header className="site-header">
      <table cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            <td valign="middle" style={{ width: 48 }}>
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
            </td>
            <td valign="middle">
              <Link href={user ? "/dashboard" : "/"} className="brand-title" style={{ fontSize: 22 }}>
                Ace McKilty Gift Registry
              </Link>
            </td>
            <td valign="middle" align="right">
              {user ? (
                <span style={{ fontSize: 12 }}>
                  {user.display_name}
                  {" · "}
                  <Link href="/dashboard">Home</Link>
                  {" · "}
                  <Link href="/faq">FAQ</Link>
                  {" · "}
                  <form action={signOut} style={{ display: "inline" }}>
                    <button type="submit" className="btn" style={{ marginLeft: 4 }}>
                      Log Out
                    </button>
                  </form>
                </span>
              ) : (
                <span style={{ fontSize: 12 }}>
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
