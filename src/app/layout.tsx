import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gift Registry",
  description:
    "Family wish lists with secret purchases — mark gifts bought without tipping off the owner.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
