import Link from "next/link";
import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: { absolute: "Ace McKilty" },
  description:
    "Public home for Ace McKilty — Gift Registry, Walkabout Mini Golf, and more.",
};

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-hub-display",
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-hub-sans",
  display: "swap",
});

const WALKABOUT_STATS =
  "https://datastudio.google.com/reporting/a69272ad-8ee8-47f7-bb4b-908f817ca6fa/page/ONLoF";
const WALKABOUT_WIKI =
  "https://walkabout-mini-golf.fandom.com/wiki/Walkabout_Mini_Golf_Wiki";

export default async function AceMcKiltyHubPage() {
  // Public hub — no login required; session (if any) is unused here on purpose.
  await getCurrentUser();

  return (
    <div className={`hub-root ${display.variable} ${sans.variable}`}>
      <div className="hub-atmosphere" aria-hidden />
      <header className="hub-top">
        <span className="hub-mark" aria-hidden>
          AM
        </span>
        <span className="hub-top-label">Ace McKilty</span>
      </header>

      <main className="hub-hero">
        <h1 className="hub-brand">Ace McKilty</h1>
        <p className="hub-lede">
          One place for the things we share — gifts, mini golf, and whatever
          comes next.
        </p>

        <nav className="hub-cta" aria-label="Ace McKilty apps">
          <Link href="/gifts" className="hub-cta-primary">
            Gift Registry
          </Link>
          <a
            href={WALKABOUT_STATS}
            className="hub-cta-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Walkabout Mini Golf Stats
          </a>
          <a
            href={WALKABOUT_WIKI}
            className="hub-cta-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Walkabout Mini Golf Wiki
          </a>
        </nav>

        <p className="hub-expand">
          More on the way — Biggest Loser, football poll, gaming league, real
          golf scores.
        </p>
      </main>
    </div>
  );
}
