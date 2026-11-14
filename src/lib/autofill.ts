import { resolveSource } from "./source";

export type AutofillResult = {
  title?: string;
  price?: string;
  imageUrl?: string;
  source?: string;
  notes?: string;
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

    const ogDesc =
      metaContent(html, "og:description") ||
      metaContent(html, "description");
    if (ogDesc) out.notes = decodeEntities(ogDesc.trim()).slice(0, 500);

    const priceMatch =
      metaContent(html, "product:price:amount") ||
      metaContent(html, "og:price:amount") ||
      html.match(/itemprop=["']price["'][^>]*content=["']([0-9.]+)["']/i)?.[1] ||
      html.match(/["']price["']\s*:\s*["']?([0-9]+(?:\.[0-9]+)?)/i)?.[1];
    if (priceMatch && !Number.isNaN(Number(priceMatch))) {
      out.price = Number(priceMatch).toFixed(2);
    }

    if (!out.title && !out.imageUrl) {
      out.warning =
        "Page fetched, but no title/image found. Edit fields manually.";
    }
  } catch {
    out.warning =
      "Could not reach that URL from this environment. Store was inferred; fill the rest manually.";
  }

  return out;
}
