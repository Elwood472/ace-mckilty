import { resolveSource } from "./source";
import { assertPublicHttpUrl, fetchPublicHttp, safeExternalHref } from "./urls";

export type AutofillResult = {
  title?: string;
  /** Amount in USD (assumed USD unless another currency was clearly indicated). */
  price?: string;
  imageUrl?: string;
  source?: string;
  warning?: string;
};

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  return html.match(re)?.[1] || html.match(re2)?.[1];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Symbols / prefixes that clearly are NOT plain US dollars. */
const CLEAR_FOREIGN_SYMBOL: Record<string, string> = {
  "£": "GBP",
  "€": "EUR",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
  "A$": "AUD",
  "C$": "CAD",
  "CA$": "CAD",
  "AU$": "AUD",
  "NZ$": "NZD",
  "HK$": "HKD",
  "S$": "SGD",
  "US$": "USD",
};

const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  AUD: 0.66,
  NZD: 0.6,
  CHF: 1.12,
  JPY: 0.0067,
  CNY: 0.14,
  INR: 0.012,
  MXN: 0.055,
  SEK: 0.095,
  NOK: 0.092,
  DKK: 0.145,
  PLN: 0.25,
  BRL: 0.18,
  KRW: 0.00074,
  HKD: 0.13,
  SGD: 0.75,
  RUB: 0.011,
};

/**
 * Parse a currency hint. Bare "$" and missing/unknown → USD (no conversion).
 * Only explicit foreign codes/symbols count as non-USD.
 */
function parseCurrencyHint(raw: string | undefined | null): {
  code: string;
  clearlyForeign: boolean;
} {
  if (raw == null || !String(raw).trim()) {
    return { code: "USD", clearlyForeign: false };
  }
  const t = String(raw).trim();
  const upper = t.toUpperCase();

  if (upper === "USD" || upper === "US$" || t === "$") {
    return { code: "USD", clearlyForeign: false };
  }
  if (/^[A-Z]{3}$/.test(upper)) {
    return { code: upper, clearlyForeign: upper !== "USD" };
  }
  if (CLEAR_FOREIGN_SYMBOL[t]) {
    const code = CLEAR_FOREIGN_SYMBOL[t];
    return { code, clearlyForeign: code !== "USD" };
  }
  // Unrecognized → assume USD, do not convert
  return { code: "USD", clearlyForeign: false };
}

async function toUsd(amount: number, currency: string): Promise<number> {
  if (currency === "USD") return amount;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://api.frankfurter.app/latest?amount=${encodeURIComponent(String(amount))}&from=${encodeURIComponent(currency)}&to=USD`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { rates?: { USD?: number } };
      if (typeof data.rates?.USD === "number") return data.rates.USD;
    }
  } catch {
    // fall through
  }

  const rate = FALLBACK_USD_RATES[currency];
  if (rate == null) return amount;
  return amount * rate;
}

type ScrapedPrice = {
  amount: number;
  currency: string;
  clearlyForeign: boolean;
};

function productSlugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    // skip locale segments like en-us
    const filtered = parts.filter((p) => !/^[a-z]{2}(-[a-z]{2})?$/i.test(p));
    const productIdx = filtered.findIndex((p) =>
      /^(product|products|dp|ip)$/i.test(p),
    );
    if (productIdx >= 0 && filtered[productIdx + 1]) {
      return filtered[productIdx + 1].toLowerCase();
    }
    return (filtered[filtered.length - 1] ?? "").toLowerCase();
  } catch {
    return "";
  }
}

function moneyFromAmount(
  amountRaw: string | number,
  currencyRaw?: string | null,
): ScrapedPrice | null {
  const amount = Number(amountRaw);
  if (Number.isNaN(amount) || amount < 0) return null;
  const cur = parseCurrencyHint(currencyRaw ?? undefined);
  return {
    amount,
    currency: cur.code,
    clearlyForeign: cur.clearlyForeign,
  };
}

/**
 * Prefer the current/sale price for THIS product (URL slug / title),
 * not compare-at, bundles, or related-card prices elsewhere on the page.
 */
function priceForProduct(
  body: string,
  slug: string,
  titleHint?: string,
): ScrapedPrice | null {
  if (!body) return null;

  // trackingEvent / product object keyed by slug
  if (slug) {
    const slugEsc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nearSlug = [
      // "slug":"arcane-jinx-ekko-tee" ... "price":{"amount":39.99,"currencyCode":"USD"}
      new RegExp(
        `"slug"\\s*:\\s*"${slugEsc}"[\\s\\S]{0,1200}?"price"\\s*:\\s*\\{\\s*"amount"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)"?\\s*,\\s*"currencyCode"\\s*:\\s*"([A-Z]{3})"`,
        "i",
      ),
      new RegExp(
        `"handle"\\s*:\\s*"${slugEsc}"[\\s\\S]{0,2000}?"variants"\\s*:\\s*\\[[\\s\\S]{0,400}?"price"\\s*:\\s*\\{[\\s\\S]{0,120}?"amount"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)"?[\\s\\S]{0,80}?"currencyCode"\\s*:\\s*"([A-Z]{3})"`,
        "i",
      ),
      new RegExp(
        `"sku"\\s*:\\s*"[^"]+"[\\s\\S]{0,200}?"price"\\s*:\\s*\\{\\s*"amount"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)"?\\s*,\\s*"currencyCode"\\s*:\\s*"([A-Z]{3})"`,
        "i",
      ),
    ];
    for (const re of nearSlug) {
      const m = body.match(re);
      if (m) {
        const money = moneyFromAmount(m[1], m[2]);
        if (money) return money;
      }
    }

    // Shopify storefront JSON: "handle":"<slug>" … "price":4900 (integer cents).
    const shopifyCents = body.match(
      new RegExp(
        `"handle"\\s*:\\s*"${slugEsc}"[\\s\\S]{0,2500}?"price"\\s*:\\s*(\\d{2,7})\\b`,
        "i",
      ),
    );
    if (shopifyCents) {
      const cents = Number(shopifyCents[1]);
      if (Number.isFinite(cents) && cents >= 0 && cents <= 10_000_000) {
        return {
          amount: cents / 100,
          currency: "USD",
          clearlyForeign: false,
        };
      }
    }

    // Window around slug occurrences — lowercase once; cap scans (DoS guard).
    const lowerBody = body.toLowerCase();
    const needle = slug.toLowerCase();
    let idx = 0;
    let scans = 0;
    const MAX_SCANS = 40;
    while (scans < MAX_SCANS && idx < lowerBody.length) {
      const i = lowerBody.indexOf(needle, idx);
      if (i < 0) break;
      scans += 1;
      const window = body.slice(i, i + 2500);
      const amount = window.match(
        /"price"\s*:\s*\{\s*"amount"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?\s*,\s*"currencyCode"\s*:\s*"([A-Z]{3})"/i,
      );
      if (amount) {
        const money = moneyFromAmount(amount[1], amount[2]);
        if (money) return money;
      }
      const amount2 = window.match(
        /"price"\s*:\s*\{\s*"__typename"\s*:\s*"MoneyV2"\s*,\s*"amount"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?\s*,\s*"currencyCode"\s*:\s*"([A-Z]{3})"/i,
      );
      if (amount2) {
        const money = moneyFromAmount(amount2[1], amount2[2]);
        if (money) return money;
      }
      idx = i + needle.length;
    }
  }

  if (titleHint) {
    // Linear window search — avoid title+[\s\S]*?price regex over large bodies.
    const needle = titleHint.slice(0, 80).toLowerCase();
    const lower = body.toLowerCase();
    let from = 0;
    for (let n = 0; n < 12 && from < lower.length; n += 1) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      const window = body.slice(i, i + 900);
      const amount = window.match(
        /"price"\s*:\s*\{\s*"amount"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?\s*,\s*"currencyCode"\s*:\s*"([A-Z]{3})"/i,
      );
      if (amount) {
        const money = moneyFromAmount(amount[1], amount[2]);
        if (money) return money;
      }
      from = i + needle.length;
    }
  }

  return null;
}

const RELATED_CARD_CLASS =
  /(?:small-product-card|product-card|related-products|also-like|recommendations)/i;

/**
 * Blank HTML comments with indexOf only (no lazy [\s\S]*? over unclosed markup).
 */
function stripHtmlComments(html: string): string {
  let out = "";
  let i = 0;
  let ops = 0;
  const MAX_OPS = 400;
  while (i < html.length && ops < MAX_OPS) {
    const start = html.indexOf("<!--", i);
    if (start < 0) {
      out += html.slice(i);
      return out;
    }
    out += html.slice(i, start);
    const end = html.indexOf("-->", start + 4);
    if (end < 0) {
      // Unclosed comment — drop the rest rather than scanning forever.
      return out + " ";
    }
    out += " ";
    i = end + 3;
    ops += 1;
  }
  if (i < html.length) out += html.slice(i);
  return out;
}

/**
 * Strip matched open/close tag pairs with a bounded linear scan.
 * Unclosed opens blank only a short window (never EOF backtracking).
 */
function stripTagPairs(
  html: string,
  tag: string,
  opts: { maxOps?: number; unclosedWindow?: number } = {},
): string {
  const maxOps = opts.maxOps ?? 300;
  const unclosedWindow = opts.unclosedWindow ?? 400;
  const openPrefix = `<${tag}`;
  const close = `</${tag}>`;
  const lowerClose = close.toLowerCase();
  let result = html;
  let ops = 0;
  let searchFrom = 0;
  while (ops < maxOps) {
    const lower = result.toLowerCase();
    const start = lower.indexOf(openPrefix, searchFrom);
    if (start < 0) break;
    const afterLt = start + openPrefix.length;
    const next = result[afterLt];
    // Require word boundary after tag name: whitespace, /, or >
    if (next && next !== ">" && next !== "/" && !/\s/.test(next)) {
      searchFrom = afterLt;
      continue;
    }
    const gt = result.indexOf(">", afterLt);
    if (gt < 0) {
      result = result.slice(0, start) + " ";
      break;
    }
    const afterOpen = gt + 1;
    const closeIdx = lower.indexOf(lowerClose, afterOpen);
    if (closeIdx < 0) {
      const end = Math.min(result.length, afterOpen + unclosedWindow);
      result = result.slice(0, start) + " " + result.slice(end);
      searchFrom = start + 1;
      ops += 1;
      continue;
    }
    result =
      result.slice(0, start) +
      " " +
      result.slice(closeIdx + close.length);
    searchFrom = start;
    ops += 1;
  }
  return result;
}

/** Strip related-product / card chrome so dollar fallbacks don't pick wrong SKUs. */
function stripRelatedChrome(html: string): string {
  let result = stripHtmlComments(html);
  let ops = 0;
  const MAX_OPS = 200;
  let searchFrom = 0;
  while (ops < MAX_OPS) {
    const lower = result.toLowerCase();
    const start = lower.indexOf("<div", searchFrom);
    if (start < 0) break;
    const gt = result.indexOf(">", start + 4);
    if (gt < 0) break;
    const openTag = result.slice(start, gt + 1);
    if (!RELATED_CARD_CLASS.test(openTag)) {
      searchFrom = start + 4;
      continue;
    }
    const afterOpen = gt + 1;
    const closeIdx = lower.indexOf("</div>", afterOpen);
    if (closeIdx < 0) {
      const end = Math.min(result.length, afterOpen + 800);
      result = result.slice(0, start) + " " + result.slice(end);
      searchFrom = start + 1;
      ops += 1;
      continue;
    }
    result = result.slice(0, start) + " " + result.slice(closeIdx + 6);
    searchFrom = start;
    ops += 1;
  }
  return result;
}

/**
 * Strip site chrome that often contains decoy dollar amounts
 * (e.g. Amazon nav "Under $10") before last-resort money scans.
 */
function stripNavChrome(html: string): string {
  let cleaned = stripHtmlComments(html);
  cleaned = stripTagPairs(cleaned, "select", { maxOps: 80, unclosedWindow: 2000 });
  cleaned = stripTagPairs(cleaned, "option", { maxOps: 400, unclosedWindow: 200 });
  cleaned = stripTagPairs(cleaned, "nav", { maxOps: 40, unclosedWindow: 8000 });
  return cleaned;
}

function isAmazonHost(host: string): boolean {
  return /(^|\.)amazon\./i.test(host);
}

function looksLikeAmazonHtml(html: string): boolean {
  return (
    /id=["'](?:twister-plus-price-data-price|desktop_buybox|apex_desktop|corePriceDisplay_desktop_feature_div)["']/i.test(
      html,
    ) || /class=["'][^"']*priceToPay[^"']*["']/i.test(html)
  );
}

function moneyFromWholeFraction(
  whole: string,
  fraction: string,
): ScrapedPrice | null {
  return moneyFromAmount(`${whole}.${fraction}`, "USD");
}

/**
 * Amazon (and similar) buy-box / one-time purchase price for THIS ASIN page.
 * Prefer the main offer; ignore nav decoys, list/basis prices, related cards,
 * "New from", and frequently-bought-together totals.
 */
function scrapeAmazonBuyBoxPrice(html: string): ScrapedPrice | null {
  // 1) Twister buy-box amount (current ASIN offer)
  const twister =
    html.match(
      /id=["']twister-plus-price-data-price["'][^>]*\bvalue=["']([0-9]+(?:\.[0-9]+)?)["']/i,
    ) ||
    html.match(
      /\bvalue=["']([0-9]+(?:\.[0-9]+)?)["'][^>]*id=["']twister-plus-price-data-price["']/i,
    );
  if (twister) {
    const money = moneyFromAmount(twister[1], "USD");
    if (money) return money;
  }

  // 2) Explicit one-time purchase line (subscribe-and-save pages)
  const oneTime = html.match(
    /One-time purchase:\s*\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i,
  );
  if (oneTime) {
    const money = moneyFromAmount(oneTime[1].replace(/,/g, ""), "USD");
    if (money) return money;
  }

  // 3) Apex / priceToPay buy-box (visible main price)
  const priceToPayRegion = html.match(
    /(?:id=["']apex_desktop["']|class=["'][^"']*priceToPay[^"']*["']|id=["']corePriceDisplay_desktop_feature_div["'])[\s\S]{0,2500}/i,
  );
  if (priceToPayRegion) {
    const region = priceToPayRegion[0]
      // list / strikethrough — bounded replace (no unbounded lazy scans)
      .replace(
        /<(?:span|div)[^>]*class=["'][^"']*(?:basisPrice|a-text-price|a-price a-text-price)[^"']*["'][^>]*>[\s\S]{0,400}?<\/(?:span|div)>/gi,
        " ",
      );
    const offscreen = region.match(
      /class=["']a-offscreen["']>\s*\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*</i,
    );
    if (offscreen) {
      const money = moneyFromAmount(offscreen[1].replace(/,/g, ""), "USD");
      if (money) return money;
    }
    const parts = region.match(
      /a-price-whole["']>([0-9]{1,3}(?:,[0-9]{3})*)[\s\S]{0,120}?a-price-fraction["']>([0-9]{2})/i,
    );
    if (parts) {
      const money = moneyFromWholeFraction(parts[1].replace(/,/g, ""), parts[2]);
      if (money) return money;
    }
  }

  // 4) desktop_buybox widget — first core a-price, not "New from" elsewhere
  const buyboxIdx = html.search(
    /id=["']desktop_buybox["']|data-feature-name=["']desktop_buybox["']/i,
  );
  if (buyboxIdx >= 0) {
    const region = html.slice(buyboxIdx, buyboxIdx + 20_000);
    const offscreen = region.match(
      /class=["']a-offscreen["']>\s*\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*</i,
    );
    if (offscreen) {
      const money = moneyFromAmount(offscreen[1].replace(/,/g, ""), "USD");
      if (money) return money;
    }
  }

  return null;
}

function scrapePrice(
  html: string,
  opts: { slug?: string; titleHint?: string; host?: string } = {},
): ScrapedPrice | null {
  const slug = opts.slug ?? "";
  const titleHint = opts.titleHint?.replace(/\s*[|\-–].*$/, "").trim();
  const host = opts.host ?? "";

  // 1) Product-scoped structured price (best for Shopify / RSC storefronts)
  const scoped = priceForProduct(html, slug, titleHint);
  if (scoped) return scoped;

  // 1b) Amazon buy-box / one-time purchase for this ASIN (before any $ scan)
  if (isAmazonHost(host) || looksLikeAmazonHtml(html)) {
    const buyBox = scrapeAmazonBuyBoxPrice(html);
    if (buyBox) return buyBox;
  }

  // 2) Classic meta tags for THIS page
  const currencyMeta =
    metaContent(html, "product:price:currency") ||
    metaContent(html, "og:price:currency") ||
    metaContent(html, "priceCurrency");
  const amountMeta =
    metaContent(html, "product:price:amount") ||
    metaContent(html, "og:price:amount") ||
    html.match(/itemprop=["']price["'][^>]*content=["']([0-9.]+)["']/i)?.[1];
  if (amountMeta && !Number.isNaN(Number(amountMeta))) {
    return moneyFromAmount(amountMeta, currencyMeta);
  }

  // 3) JSON-LD offers (often the main product) — linear script extraction
  {
    const lower = html.toLowerCase();
    let from = 0;
    let blocks = 0;
    while (blocks < 30 && from < html.length) {
      const marker = lower.indexOf("application/ld+json", from);
      if (marker < 0) break;
      const scriptOpen = lower.lastIndexOf("<script", marker);
      if (scriptOpen < 0 || marker - scriptOpen > 200) {
        from = marker + 1;
        continue;
      }
      const gt = html.indexOf(">", marker);
      if (gt < 0) break;
      const close = lower.indexOf("</script>", gt + 1);
      if (close < 0) break;
      const raw = html.slice(gt + 1, close).slice(0, 120_000);
      blocks += 1;
      from = close + 9;
      try {
        const data = JSON.parse(raw) as unknown;
        const found = findOfferPrice(data);
        if (found) return found;
      } catch {
        // ignore
      }
    }
  }

  // 4) Dollar amounts only outside related-product cards + nav chrome
  const cleaned = stripNavChrome(stripRelatedChrome(html));
  // Prefer amounts near the main H1 product title (indexOf window, not regex)
  if (titleHint) {
    const hint = titleHint.slice(0, 60).toLowerCase();
    const lowerClean = cleaned.toLowerCase();
    let h1From = 0;
    for (let n = 0; n < 8; n += 1) {
      const h1Open = lowerClean.indexOf("<h1", h1From);
      if (h1Open < 0) break;
      const h1Gt = cleaned.indexOf(">", h1Open);
      if (h1Gt < 0) break;
      const region = cleaned.slice(h1Gt + 1, h1Gt + 1 + 2500);
      if (region.toLowerCase().includes(hint)) {
        const near = region.match(
          /(?:(US\$|CA\$|AU\$|NZ\$|HK\$|S\$|A\$|C\$)|([€£¥₹₽₩$]))\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/,
        );
        if (near) {
          const cur = parseCurrencyHint(near[1] || near[2] || "$");
          const amount = Number(near[3].replace(/,/g, ""));
          if (!Number.isNaN(amount)) {
            return {
              amount,
              currency: cur.code,
              clearlyForeign: cur.clearlyForeign,
            };
          }
        }
      }
      h1From = h1Gt + 1;
    }
  }

  // Last resort: first money symbol in cleaned HTML (related cards + nav stripped)
  const money = cleaned.match(
    /(?:(US\$|CA\$|AU\$|NZ\$|HK\$|S\$|A\$|C\$)|([€£¥₹₽₩$]))\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/,
  );
  if (money) {
    const cur = parseCurrencyHint(money[1] || money[2] || "$");
    const amount = Number(money[3].replace(/,/g, ""));
    if (!Number.isNaN(amount)) {
      return {
        amount,
        currency: cur.code,
        clearlyForeign: cur.clearlyForeign,
      };
    }
  }

  return null;
}

function findOfferPrice(node: unknown): ScrapedPrice | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOfferPrice(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  // Prefer offers.price; ignore offers.highPrice / list price when price exists
  const offers = obj.offers;
  if (offers && typeof offers === "object") {
    const o = (Array.isArray(offers) ? offers[0] : offers) as Record<
      string,
      unknown
    >;
    const price = o?.price ?? o?.lowPrice;
    if (price != null && !Number.isNaN(Number(price))) {
      return moneyFromAmount(
        price as string | number,
        typeof o.priceCurrency === "string" ? o.priceCurrency : undefined,
      );
    }
  }
  for (const v of Object.values(obj)) {
    const found = findOfferPrice(v);
    if (found) return found;
  }
  return null;
}

async function fetchNextRscBody(pageUrl: string): Promise<string> {
  try {
    const u = new URL(pageUrl);
    if (!u.searchParams.has("_rsc")) u.searchParams.set("_rsc", "1");
    const res = await fetchPublicHttp(u.toString(), {
      timeoutMs: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AceMcKiltyGiftRegistry/1.0; +local)",
        Accept: "text/x-component",
        RSC: "1",
      },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!/x-component|text\/plain|octet-stream/i.test(ct) && !ct.includes("rsc")) {
      // Some hosts still return flight data with odd types — keep if body looks like it
      const text = await res.text();
      return text.includes('"amount"') ? text.slice(0, 200_000) : "";
    }
    return (await res.text()).slice(0, 200_000);
  } catch {
    return "";
  }
}

export async function autofillFromGiftUrl(url: string): Promise<AutofillResult> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { warning: "Enter a full http(s) URL first." };
  }

  let pageUrl: string;
  try {
    pageUrl = (await assertPublicHttpUrl(trimmed)).toString();
  } catch {
    return {
      warning:
        "That URL is not allowed (use a public http(s) product page).",
    };
  }

  const source = resolveSource("", pageUrl);
  const out: AutofillResult = { source: source || undefined };

  try {
    const res = await fetchPublicHttp(pageUrl, {
      timeoutMs: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      out.warning = `Could not fetch page (HTTP ${res.status}). Fill fields manually.`;
      return out;
    }
    // Cap HTML parse size to limit memory / CPU on crafted pages.
    // Keep enough for Shopify `var meta` product JSON (often past 400KB).
    const html = (await res.text()).slice(0, 750_000);
    const ogTitle =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (ogTitle) out.title = decodeEntities(ogTitle.trim()).slice(0, 200);

    const ogImage =
      metaContent(html, "og:image") || metaContent(html, "twitter:image");
    if (ogImage) {
      try {
        out.imageUrl = safeExternalHref(new URL(ogImage, pageUrl).toString()) ?? undefined;
      } catch {
        out.imageUrl = safeExternalHref(ogImage) ?? undefined;
      }
    }

    // Notes are intentionally not filled from scraped description.

    const slug = productSlugFromUrl(pageUrl);
    const titleHint = out.title;
    let host = "";
    try {
      host = new URL(pageUrl).hostname;
    } catch {
      host = "";
    }
    // Prefer slug-scoped structured price from HTML, then RSC flight data
    // (many storefronts only embed the real SKU price in RSC), then HTML fallbacks
    // (Amazon buy-box / one-time purchase before any naive $ scan).
    let scraped =
      priceForProduct(html, slug, titleHint) ||
      null;
    if (!scraped && (isAmazonHost(host) || looksLikeAmazonHtml(html))) {
      scraped = scrapeAmazonBuyBoxPrice(html);
    }
    if (!scraped && slug) {
      const rsc = await fetchNextRscBody(pageUrl);
      if (rsc) scraped = priceForProduct(rsc, slug, titleHint);
    }
    if (!scraped) scraped = scrapePrice(html, { slug, titleHint, host });

    if (scraped) {
      if (scraped.clearlyForeign) {
        const usd = await toUsd(scraped.amount, scraped.currency);
        out.price = usd.toFixed(2);
        out.warning = `Price converted to USD from ${scraped.currency}.`;
      } else {
        // Bare number / $ / USD — use as-is (assumed USD)
        out.price = scraped.amount.toFixed(2);
      }
    }

    if (!out.title && !out.imageUrl && !out.price) {
      out.warning =
        "Page fetched, but no title/image/price found. Edit fields manually.";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/not allowed|Invalid URL|Only http/i.test(msg)) {
      out.warning =
        "That URL is not allowed (use a public http(s) product page).";
    } else {
      out.warning =
        "Could not reach that URL from this environment. Store was inferred; fill the rest manually.";
    }
  }

  return out;
}
