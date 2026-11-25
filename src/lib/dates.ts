/** Next occurrence of a month/day anniversary or birthday from today (local). */
export function nextOccurrence(isoDate: string | null | undefined, from = new Date()): Date | null {
  if (!isoDate) return null;
  const raw = isoDate.slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  if (!m || !d) return null;
  const year = from.getFullYear();
  const candidate = new Date(year, m - 1, d);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (candidate < today) {
    return new Date(year + 1, m - 1, d);
  }
  return candidate;
}

export function daysUntil(isoDate: string | null | undefined, from = new Date()): number | null {
  const next = nextOccurrence(isoDate, from);
  if (!next) return null;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export function formatMd(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const raw = isoDate.slice(0, 10);
  const [, m, d] = raw.split("-");
  if (!m || !d) return raw;
  return `${m}/${d}`;
}

export function formatMdY(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const raw = isoDate.slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!m || !d) return raw;
  return `${m}/${d}/${y}`;
}

/** Date + time for admin activity (America/New_York). */
export function formatMdYTime(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const when = new Date(isoDate);
  if (Number.isNaN(when.getTime())) return formatMdY(isoDate);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
}

/** Recent activity cue like the old site: red+bold ≤2 days, bold ≤4 days. */
export function activityClass(isoDate: string | null | undefined, from = new Date()): string {
  if (!isoDate) return "";
  const when = new Date(isoDate);
  if (Number.isNaN(when.getTime())) return "";
  const days =
    (from.getTime() - when.getTime()) / 86400000;
  if (days <= 2) return "activity-hot";
  if (days <= 4) return "activity-warm";
  return "";
}
