/**
 * Header cutouts between brand and nav.
 * Default pool: random. Holiday windows override when that holiday has images.
 */

export type HeaderHoliday =
  | "new-year"
  | "valentine"
  | "st-patrick"
  | "easter"
  | "july-4"
  | "halloween"
  | "thanksgiving"
  | "christmas";

export type HeaderBanner = {
  src: string;
  /** Omit / "default" = everyday pool. */
  holiday?: HeaderHoliday | "default";
};

/** Everyday art — pick at random when no holiday set is active. */
export const HEADER_BANNERS_DEFAULT: HeaderBanner[] = [
  { src: "/header/ace-lean.png" },
  { src: "/header/ace-point.png" },
  { src: "/header/ace-arms.png" },
];

/**
 * Holiday art — add files here as Rick supplies them.
 * Empty arrays fall through to the default pool.
 */
export const HEADER_BANNERS_HOLIDAY: Record<
  HeaderHoliday,
  HeaderBanner[]
> = {
  "new-year": [],
  valentine: [],
  "st-patrick": [],
  easter: [],
  "july-4": [],
  halloween: [],
  thanksgiving: [{ src: "/header/ace-thanksgiving.png" }],
  christmas: [],
};

type EasternYmd = { year: number; month: number; day: number };

function easternYmd(now: Date): EasternYmd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/** US Thanksgiving = 4th Thursday of November (Eastern calendar year). */
export function usThanksgivingDay(year: number): number {
  // Noon UTC on Nov 1 is morning Eastern — stable weekday for the 1st.
  const nov1 = new Date(Date.UTC(year, 10, 1, 17, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(nov1);
  const dow: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const firstThursday = ((4 - (dow[weekday] ?? 0) + 7) % 7) + 1;
  return firstThursday + 21;
}

/**
 * Thanksgiving window: day before, Thanksgiving, and Fri–Sun after
 * (Wed through Sun of Thanksgiving week).
 */
export function isThanksgivingWindow(now = new Date()): boolean {
  const { year, month, day } = easternYmd(now);
  if (month !== 11) return false;
  const turkey = usThanksgivingDay(year);
  return day >= turkey - 1 && day <= turkey + 3;
}

/** US-oriented windows (America/New_York calendar day). Expand as needed. */
export function activeHeaderHoliday(
  now = new Date(),
): HeaderHoliday | null {
  const { month, day } = easternYmd(now);

  if (month === 12 && day >= 20) return "christmas";
  if (month === 1 && day <= 2) return "new-year";
  if (month === 2 && day >= 10 && day <= 14) return "valentine";
  if (month === 3 && day >= 15 && day <= 17) return "st-patrick";
  // Easter varies — leave empty until dated images arrive
  if (month === 7 && day >= 3 && day <= 5) return "july-4";
  if (month === 10 && day >= 25) return "halloween";
  if (isThanksgivingWindow(now)) return "thanksgiving";
  return null;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** One banner for this render — holiday set if available, else random default. */
export function pickHeaderBanner(now = new Date()): HeaderBanner {
  const holiday = activeHeaderHoliday(now);
  if (holiday) {
    const set = HEADER_BANNERS_HOLIDAY[holiday];
    if (set.length > 0) return pickRandom(set);
  }
  return pickRandom(HEADER_BANNERS_DEFAULT);
}
