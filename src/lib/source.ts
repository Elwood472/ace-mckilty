/** Marketing / locale left-labels — not the brand. */
const SKIP_LABELS = new Set([
  "www",
  "www2",
  "www3",
  "m",
  "mobile",
  "shop",
  "store",
  "stores",
  "merch",
  "merchandise",
  "buy",
  "cart",
  "checkout",
  "cdn",
  "static",
  "assets",
  "images",
  "img",
  "media",
  "api",
  "app",
  "secure",
  "en",
  "en-us",
  "en-gb",
  "us",
  "uk",
  "eu",
  "ca",
  "au",
  "de",
  "fr",
  "jp",
  "es",
  "it",
]);

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "co.nz",
  "co.jp",
  "com.br",
  "co.kr",
  "com.mx",
]);

/** Well-known store / brand labels by hostname match (checked first). */
const KNOWN_BRANDS: { test: (host: string) => boolean; label: string }[] = [
  { test: (h) => h.includes("amazon."), label: "Amazon" },
  { test: (h) => h.includes("entertainmentearth."), label: "Entertainment Earth" },
  { test: (h) => h.includes("art.com") || h.includes("allposters."), label: "Art.com" },
  { test: (h) => h.includes("etsy."), label: "Etsy" },
  { test: (h) => h.includes("walmart."), label: "Walmart" },
  { test: (h) => h.includes("target."), label: "Target" },
  { test: (h) => h.includes("bestbuy."), label: "Best Buy" },
  { test: (h) => h.includes("apple."), label: "Apple" },
  { test: (h) => h.includes("ebay."), label: "eBay" },
  { test: (h) => /(^|\.)riotgames\.com$/.test(h), label: "Riot Games" },
  { test: (h) => /(^|\.)steampowered\.com$|(^|\.)steamcommunity\.com$/.test(h), label: "Steam" },
  { test: (h) => /(^|\.)nintendo\.com$/.test(h), label: "Nintendo" },
  { test: (h) => /(^|\.)playstation\.com$/.test(h), label: "PlayStation" },
  { test: (h) => /(^|\.)xbox\.com$/.test(h), label: "Xbox" },
  { test: (h) => /(^|\.)newegg\.com$/.test(h), label: "Newegg" },
  { test: (h) => /(^|\.)homedepot\.com$/.test(h), label: "Home Depot" },
  { test: (h) => /(^|\.)lowes\.com$/.test(h), label: "Lowe's" },
  { test: (h) => /(^|\.)wayfair\.com$/.test(h), label: "Wayfair" },
  { test: (h) => /(^|\.)costco\.com$/.test(h), label: "Costco" },
];

/** Brand aliases when the registrable SLD is a mashed word. */
const SLD_ALIASES: Record<string, string> = {
  riotgames: "Riot Games",
  bestbuy: "Best Buy",
  homedepot: "Home Depot",
  newegg: "Newegg",
  entertainmentearth: "Entertainment Earth",
  allposters: "Art.com",
  steampowered: "Steam",
  steamcommunity: "Steam",
  playstation: "PlayStation",
  gamestop: "GameStop",
  barnesandnoble: "Barnes & Noble",
  bandn: "Barnes & Noble",
};

function registrableSld(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  let labels = host.split(".").filter(Boolean);

  // Drop marketing / locale prefixes while we still have a domain left
  while (labels.length > 2 && SKIP_LABELS.has(labels[0])) {
    labels = labels.slice(1);
  }
  // Also drop a marketing label when eTLD+1 would still remain
  // e.g. merch.riotgames.com → riotgames.com
  const joinedTld = labels.slice(-2).join(".");
  const isMulti = MULTI_PART_TLDS.has(joinedTld);
  const minLabels = isMulti ? 3 : 2;
  while (labels.length > minLabels && SKIP_LABELS.has(labels[0])) {
    labels = labels.slice(1);
  }

  if (isMulti && labels.length >= 3) {
    return labels[labels.length - 3] ?? "";
  }
  if (labels.length >= 2) {
    return labels[labels.length - 2] ?? "";
  }
  return labels[0] ?? "";
}

function titleCaseBrand(sld: string): string {
  const key = sld.toLowerCase();
  if (SLD_ALIASES[key]) return SLD_ALIASES[key];
  // camelCase / PascalCase → spaces
  const spaced = sld
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Infer store/source label from an item URL. */
export function inferSourceFromUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  try {
    const host = new URL(u.startsWith("http") ? u : `https://${u}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    for (const brand of KNOWN_BRANDS) {
      if (brand.test(host)) return brand.label;
    }

    const sld = registrableSld(host);
    if (!sld || SKIP_LABELS.has(sld)) return "";
    return titleCaseBrand(sld);
  } catch {
    return "";
  }
}

export function resolveSource(explicit: string, url: string): string {
  const e = explicit.trim();
  if (e) return e;
  return inferSourceFromUrl(url);
}
