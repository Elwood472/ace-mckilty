import { resolveSource } from "./source";

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

    // Window around each slug occurrence — take the first price.amount (not compareAt)
    let idx = 0;
    while (idx < body.length) {
      const i = body.toLowerCase().indexOf(slug, idx);
      if (i < 0) break;
      const window = body.slice(i, i + 2500);
      if (/compareAtPrice|compare_at_price|normalPrice/i.test(window)) {
        // still allow current price in same window
      }
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
      idx = i + slug.length;
    }
  }

  if (titleHint) {
    const esc = titleHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 80);
    const re = new RegExp(
      `${esc}[\\s\\S]{0,900}?"price"\\s*:\\s*\\{\\s*"amount"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)"?\\s*,\\s*"currencyCode"\\s*:\\s*"([A-Z]{3})"`,
      "i",
    );
    const m = body.match(re);
    if (m) {
      const money = moneyFromAmount(m[1], m[2]);
      if (money) return money;
    }
  }

  return null;
}

/** Strip related-product / card chrome so dollar fallbacks don't pick wrong SKUs. */
function stripRelatedChrome(html: string): string {
  return html
    .replace(
      /<div[^>]*class="[^"]*(?:small-product-card|product-card|related-products|also-like|recommendations)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      " ",
    )
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function scrapePrice(
  html: string,
  opts: { slug?: string; titleHint?: string } = {},
): ScrapedPrice | null {
  const slug = opts.slug ?? "";
  const titleHint = opts.titleHint?.replace(/\s*[|\-–].*$/, "").trim();

  // 1) Product-scoped structured price (best)
  const scoped = priceForProduct(html, slug, titleHint);
  if (scoped) return scoped;

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

  // 3) JSON-LD offers (often the main product)
  const jsonLdBlocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const m of jsonLdBlocks) {
    try {
      const data = JSON.parse(m[1]) as unknown;
      const found = findOfferPrice(data);
      if (found) return found;
    } catch {
      // ignore
    }
  }

  // 4) Dollar amounts only outside related-product cards; skip compare-at styling when possible
  const cleaned = stripRelatedChrome(html);
  // Prefer amounts near the main H1 product title
  if (titleHint) {
    const h1 = cleaned.match(
      new RegExp(
        `<h1[^>]*>\\s*${titleHint.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&").slice(0, 60)}[\\s\\S]{0,2500}`,
        "i",
      ),
    );
    if (h1) {
      const near = h1[0].match(
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
  }

  // Last resort: first money symbol in cleaned HTML (related cards stripped)
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AceMcKiltyGiftRegistry/1.0; +local)",
        Accept: "text/x-component",
        RSC: "1",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!/x-component|text\/plain|octet-stream/i.test(ct) && !ct.includes("rsc")) {
      // Some hosts still return flight data with odd types — keep if body looks like it
      const text = await res.text();
      return text.includes('"amount"') ? text.slice(0, 600_000) : "";
    }
    return (await res.text()).slice(0, 600_000);
  } catch {
    return "";
  }
}

export async function autofillFromGiftUrl(url: string): Promise<AutofillResult> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { warning: "Enter a full http(s) URL first." };
  }

  const source = resolveSource("", trimmed);
  const out: AutofillResult = { source: source || undefined };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(trimmed, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AceMcKiltyGiftRegistry/1.0; +local)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) {
      out.warning = `Could not fetch page (HTTP ${res.status}). Fill fields manually.`;
      return out;
    }
    const html = (await res.text()).slice(0, 400_000);
    const ogTitle =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (ogTitle) out.title = decodeEntities(ogTitle.trim()).slice(0, 200);

    const ogImage =
      metaContent(html, "og:image") || metaContent(html, "twitter:image");
    if (ogImage) {
      try {
        out.imageUrl = new URL(ogImage, trimmed).toString();
      } catch {
        out.imageUrl = ogImage;
      }
    }

    // Notes are intentionally not filled from scraped description.

    const slug = productSlugFromUrl(trimmed);
    const titleHint = out.title;
    // Prefer slug-scoped structured price from HTML, then RSC flight data
    // (many storefronts only embed the real SKU price in RSC), then HTML fallbacks.
    let scraped =
      priceForProduct(html, slug, titleHint) ||
      null;
    if (!scraped && slug) {
      const rsc = await fetchNextRscBody(trimmed);
      if (rsc) scraped = priceForProduct(rsc, slug, titleHint);
    }
    if (!scraped) scraped = scrapePrice(html, { slug, titleHint });

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
  } catch {
    out.warning =
      "Could not reach that URL from this environment. Store was inferred; fill the rest manually.";
  }

  return out;
}
