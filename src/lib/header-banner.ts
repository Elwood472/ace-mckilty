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
  thanksgiving: [],
  christmas: [],
};

/** US-oriented windows (America/New_York calendar day). Expand as needed. */
export function activeHeaderHoliday(
  now = new Date(),
): HeaderHoliday | null {
  // Interpret in Eastern Time so holiday flips match Rick's day.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  if (month === 12 && day >= 20) return "christmas";
  if (month === 1 && day <= 2) return "new-year";
  if (month === 2 && day >= 10 && day <= 14) return "valentine";
  if (month === 3 && day >= 15 && day <= 17) return "st-patrick";
  // Easter varies — leave empty until dated images arrive
  if (month === 7 && day >= 3 && day <= 5) return "july-4";
  if (month === 10 && day >= 25) return "halloween";
  // Thanksgiving week (approx late Nov) — refine when images land
  if (month === 11 && day >= 20 && day <= 28) return "thanksgiving";
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
