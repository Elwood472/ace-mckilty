import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { resolveTheme, themeToCssVars } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ace McKilty",
    template: "%s · Ace McKilty",
  },
  description:
    "Ace McKilty — shared home for Gift Registry, Walkabout Mini Golf links, and more.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  let themeStyle: CSSProperties | undefined;
  if (user) {
    try {
      const rows = await sql<{
        theme_accent: string;
        theme_page: string;
        theme_link: string;
      }>(
        `select theme_accent, theme_page, theme_link from users where id = $1`,
        [user.id],
      );
      themeStyle = themeToCssVars(resolveTheme(rows[0] ?? null)) as CSSProperties;
    } catch {
      // Theme columns may not exist until migrate; fall back to CSS defaults.
      themeStyle = undefined;
    }
  }

  return (
    <html lang="en" className="h-full" style={themeStyle}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
