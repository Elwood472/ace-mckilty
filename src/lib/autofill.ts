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

function scrapePrice(html: string): ScrapedPrice | null {
  const currencyMeta =
    metaContent(html, "product:price:currency") ||
    metaContent(html, "og:price:currency") ||
    metaContent(html, "priceCurrency");

  const amountMeta =
    metaContent(html, "product:price:amount") ||
    metaContent(html, "og:price:amount") ||
    html.match(/itemprop=["']price["'][^>]*content=["']([0-9.]+)["']/i)?.[1];

  if (amountMeta && !Number.isNaN(Number(amountMeta))) {
    const cur = parseCurrencyHint(currencyMeta);
    return {
      amount: Number(amountMeta),
      currency: cur.code,
      clearlyForeign: cur.clearlyForeign,
    };
  }

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

  // Only match when a currency symbol/prefix is present — bare numbers are ignored here
  const money = html.match(
    /(?:(US\$|CA\$|AU\$|NZ\$|HK\$|S\$|A\$|C\$)|([€£¥₹₽₩$]))\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/,
  );
  if (money) {
    const sym = money[1] || money[2] || "$";
    const amount = Number(money[3].replace(/,/g, ""));
    if (!Number.isNaN(amount)) {
      const cur = parseCurrencyHint(sym);
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
  const offers = obj.offers;
  if (offers && typeof offers === "object") {
    const o = (Array.isArray(offers) ? offers[0] : offers) as Record<
      string,
      unknown
    >;
    const price = o?.price ?? o?.lowPrice;
    if (price != null && !Number.isNaN(Number(price))) {
      const cur = parseCurrencyHint(
        typeof o.priceCurrency === "string" ? o.priceCurrency : undefined,
      );
      return {
        amount: Number(price),
        currency: cur.code,
        clearlyForeign: cur.clearlyForeign,
      };
    }
  }
  for (const v of Object.values(obj)) {
    const found = findOfferPrice(v);
    if (found) return found;
  }
  return null;
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

    const scraped = scrapePrice(html);
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
