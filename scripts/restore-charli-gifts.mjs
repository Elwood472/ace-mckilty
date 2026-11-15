/**
 * Restore missing Charli gifts from recovery log URLs.
 * Run only while Next is stopped (exclusive PGlite access).
 */
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LIST_ID = "205358b7-38cc-4e7c-9a1a-8fb6e04c2ded";
const CHARLI_EMAIL = "cmebray@gmail.com";

const ETSY_URL =
  "https://www.etsy.com/listing/4322510599/arcane-jinx-and-vi-art-t-shirt-mens?ls=s&ga_order=most_relevant&ga_search_type=all&ga_view_type=gallery&ga_search_query=arcane+jinx+t+shirts&ref=sr_gallery-1-3&sr_prefetch=1&pf_from=market&pro=1&sts=1&content_source=c1670912-f720-4971-90d2-9980f00a5d15%253ALTa702dc091ede9057649f1952b5c1d92cf66fd50e&organic_search_click=1&logging_key=c1670912-f720-4971-90d2-9980f00a5d15%3ALTa702dc091ede9057649f1952b5c1d92cf66fd50e&variation0=5483833173&variation1=5504982528&dd_referrer=https%3A%2F%2Fwww.google.com%2F";

const RESTORE_URLS = [
  "https://www.amazon.com/dp/B0B19MQ14M",
  "https://www.amazon.com/dp/B0FPC7Y55Y",
  ETSY_URL,
  "https://merch.riotgames.com/en-us/product/arcane-champion-jinx-statue/",
  "https://www.amazon.com/dp/B0DRPJH5FS",
  "https://www.amazon.com/dp/B0D6CQWRPC",
  "https://www.amazon.com/dp/B0CSVK2ZV6/",
  "https://www.amazon.com/dp/B0CSVRQ8JN",
];

const TITLE_HINTS = {
  B0B19MQ14M: "Amazon gift (ASIN B0B19MQ14M)",
  B0FPC7Y55Y: "Amazon gift (ASIN B0FPC7Y55Y)",
  B0DRPJH5FS: "Amazon gift (ASIN B0DRPJH5FS)",
  B0D6CQWRPC: "Amazon gift (ASIN B0D6CQWRPC)",
  B0CSVK2ZV6: "Funko POP! Collectible (ASIN B0CSVK2ZV6)",
  B0CSVRQ8JN: "Amazon gift (ASIN B0CSVRQ8JN)",
  4322510599: "Arcane Jinx and Vi Art T-Shirt (Etsy)",
};

function asinFromUrl(url) {
  const m =
    url.match(/\/(?:dp|product)\/([A-Z0-9]{10})/i) ||
    url.match(/\b(B0[A-Z0-9]{8})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function listingIdFromUrl(url) {
  const m = url.match(/etsy\.com\/listing\/(\d+)/i);
  return m ? m[1] : null;
}

function inferSource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("amazon.")) return "Amazon";
    if (host.includes("etsy.")) return "Etsy";
    if (host.includes("riotgames")) return "Riot Games";
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function urlAlreadyPresent(existingUrls, candidate) {
  const asin = asinFromUrl(candidate);
  const listing = listingIdFromUrl(candidate);
  const norm = candidate.toLowerCase().split("?")[0].replace(/\/$/, "");
  for (const u of existingUrls) {
    const eu = String(u || "");
    if (!eu) continue;
    if (eu.toLowerCase().split("?")[0].replace(/\/$/, "") === norm) return true;
    if (asin && eu.toUpperCase().includes(asin)) return true;
    if (listing && eu.includes(listing)) return true;
  }
  return false;
}

function autofill(url) {
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      "-e",
      `
      import { autofillFromGiftUrl } from "./src/lib/autofill.ts";
      const r = await autofillFromGiftUrl(${JSON.stringify(url)});
      process.stdout.write(JSON.stringify(r));
      `,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 25000 },
  );
  if (r.status !== 0) {
    console.error("autofill stderr", r.stderr?.slice(0, 300));
    return {};
  }
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return {};
  }
}

async function scrapeFallback(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AceMcKiltyGiftRegistry/1.0; +local)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    const html = (await res.text()).slice(0, 700_000);
    const ogTitle =
      html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const ogImage =
      html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
    const twister = html.match(
      /id=["']twister-plus-price-data-price["'][^>]*\bvalue=["']([0-9]+(?:\.[0-9]+)?)["']/i,
    );
    let imageUrl = "";
    if (ogImage) {
      try {
        imageUrl = new URL(ogImage, url).toString();
      } catch {
        imageUrl = ogImage;
      }
    }
    return {
      title: ogTitle
        ? ogTitle.replace(/&amp;/g, "&").replace(/&ndash;/g, "–").trim()
        : "",
      price: twister ? twister[1] : undefined,
      imageUrl,
    };
  } catch {
    return {};
  }
}

const db = new PGlite(path.join(ROOT, ".data", "pglite"));
await db.waitReady;

const charli = (
  await db.query("select id from users where email = $1", [CHARLI_EMAIL])
).rows[0];
if (!charli) throw new Error("Charli user not found");

const existing = (
  await db.query(
    "select id, title, url from items where list_id = $1 and deleted = false",
    [LIST_ID],
  )
).rows;
const existingUrls = existing.map((r) => r.url);

const restored = [];
const skipped = [];

for (const url of RESTORE_URLS) {
  if (urlAlreadyPresent(existingUrls, url)) {
    skipped.push({ url, reason: "already present" });
    console.log("SKIP", url.slice(0, 80));
    continue;
  }

  console.log("FETCH", url.slice(0, 90));
  let meta = autofill(url);
  if (!meta.title || /^amazon\.com$/i.test(meta.title)) {
    const fb = await scrapeFallback(url);
    if (fb.title && !/^amazon\.com$/i.test(fb.title)) meta.title = fb.title;
    if (!meta.price && fb.price) meta.price = fb.price;
    if (!meta.imageUrl && fb.imageUrl) meta.imageUrl = fb.imageUrl;
  }

  const asin = asinFromUrl(url);
  const listing = listingIdFromUrl(url);
  let title = (meta.title || "").trim();
  if (!title || /^amazon\.com$/i.test(title) || title.length < 4) {
    if (asin && TITLE_HINTS[asin]) title = TITLE_HINTS[asin];
    else if (listing && TITLE_HINTS[listing]) title = TITLE_HINTS[listing];
    else title = `Restored gift ${asin || listing || ""}`.trim();
  }

  const priceRaw = meta.price != null && meta.price !== "" ? Number(meta.price) : null;
  const price = priceRaw != null && !Number.isNaN(priceRaw) ? priceRaw : null;
  const source = meta.source || inferSource(url);
  const imageUrl = meta.imageUrl || "";

  const rows = await db.query(
    `insert into items (
       list_id, title, notes, url, price, category, source, quantity,
       image_url, display_date, restricted, created_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning id, title, url, price::text as price, source`,
    [
      LIST_ID,
      title.slice(0, 200),
      "",
      url,
      price,
      "",
      source,
      1,
      imageUrl,
      null,
      false,
      charli.id,
    ],
  );
  const row = rows.rows[0];
  restored.push(row);
  existingUrls.push(url);
  console.log("RESTORED", row.title.slice(0, 70), row.price, row.source);
}

const charliActive = (
  await db.query(
    "select count(*)::int as c from items where list_id = $1 and deleted = false",
    [LIST_ID],
  )
).rows[0].c;

const rickCharliCombined = (
  await db.query(
    `select count(*)::int as c
     from items i
     join wish_list_owners o on o.list_id = i.list_id
     join users u on u.id = o.user_id
     where u.email in ('bluesbrthr@gmail.com','cmebray@gmail.com')
       and i.deleted = false`,
  )
).rows[0].c;

const rickCount = (
  await db.query(
    `select count(*)::int as c
     from items i
     join wish_list_owners o on o.list_id = i.list_id
     join users u on u.id = o.user_id
     where u.email = 'bluesbrthr@gmail.com' and i.deleted = false`,
  )
).rows[0].c;

await db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      restoredCount: restored.length,
      skipped,
      restored: restored.map((r) => ({
        title: r.title,
        url: r.url,
        price: r.price,
        source: r.source,
      })),
      rickActive: rickCount,
      charliActive,
      rickCharliCombined,
    },
    null,
    2,
  ),
);
