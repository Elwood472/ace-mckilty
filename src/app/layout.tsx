import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ace McKilty",
    template: "%s · Ace McKilty",
  },
  description:
    "Ace McKilty — shared home for Gift Registry, Walkabout Mini Golf links, and more.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
