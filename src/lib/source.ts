/** Infer store/source label from an item URL. */
export function inferSourceFromUrl(url: string): string {
  const u = url.trim().toLowerCase();
  if (!u) return "";
  try {
    const host = new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(
      /^www\./,
      "",
    );
    if (host.includes("amazon.")) return "Amazon";
    if (host.includes("entertainmentearth.")) return "Entertainment Earth";
    if (host.includes("art.com") || host.includes("allposters.")) return "Art.com";
    if (host.includes("etsy.")) return "Etsy";
    if (host.includes("walmart.")) return "Walmart";
    if (host.includes("target.")) return "Target";
    if (host.includes("bestbuy.")) return "Best Buy";
    if (host.includes("apple.")) return "Apple";
    if (host.includes("ebay.")) return "eBay";
    // First label of hostname, capitalized
    const base = host.split(".")[0] ?? host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "";
  }
}

export function resolveSource(explicit: string, url: string): string {
  const e = explicit.trim();
  if (e) return e;
  return inferSourceFromUrl(url);
}
