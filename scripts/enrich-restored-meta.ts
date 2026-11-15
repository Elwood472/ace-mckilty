/**
 * Enrich recently restored Charli items with better title/price/image via autofill.
 */
import { PGlite } from "@electric-sql/pglite";
import { autofillFromGiftUrl } from "../src/lib/autofill";

const LIST_ID = "205358b7-38cc-4e7c-9a1a-8fb6e04c2ded";
const ASINS = [
  "B0B19MQ14M",
  "B0FPC7Y55Y",
  "B0DRPJH5FS",
  "B0D6CQWRPC",
  "B0CSVK2ZV6",
  "B0CSVRQ8JN",
];

async function main() {
  const db = new PGlite("./.data/pglite");
  await db.waitReady;

  const items = (
    await db.query<{
      id: string;
      title: string;
      url: string;
      price: string | null;
      source: string;
      image_url: string;
    }>(
      `select id, title, url, price::text as price, source, image_url
       from items
       where list_id = $1 and deleted = false
         and (
           title ilike 'Amazon gift%'
           or title = 'etsy.com'
           or title ilike '%Champion Jinx%'
           or url ilike '%B0B19MQ14M%'
           or url ilike '%B0FPC7Y55Y%'
           or url ilike '%B0DRPJH5FS%'
           or url ilike '%B0D6CQWRPC%'
           or url ilike '%B0CSVK2ZV6%'
           or url ilike '%B0CSVRQ8JN%'
           or url ilike '%etsy.com/listing/4322510599%'
           or url ilike '%arcane-champion-jinx-statue%'
         )
       order by created_at`,
      [LIST_ID],
    )
  ).rows;

  const updates: { id: string; title: string; price: string | null; source: string }[] =
    [];

  for (const item of items) {
    const meta = await autofillFromGiftUrl(item.url);
    let title = (meta.title || item.title || "").trim();
    if (!title || /^amazon\.com$/i.test(title) || title === "etsy.com") {
      const asin = ASINS.find((a) => item.url.toUpperCase().includes(a));
      if (item.url.includes("etsy.com")) {
        title = "Arcane Jinx and Vi Art T-Shirt (Etsy)";
      } else if (asin) {
        title = item.title.startsWith("Amazon gift")
          ? item.title
          : `Amazon gift (ASIN ${asin})`;
      }
    }
    // Prefer scraped buy-box style amounts from autofill
    let price: number | null =
      meta.price != null && meta.price !== "" && !Number.isNaN(Number(meta.price))
        ? Number(meta.price)
        : item.price != null
          ? Number(item.price)
          : null;
    if (price != null && Number.isNaN(price)) price = null;

    const source = meta.source || item.source || "";
    const imageUrl = meta.imageUrl || item.image_url || "";

    await db.query(
      `update items set
         title = $1,
         price = $2,
         source = $3,
         image_url = $4,
         updated_at = now()
       where id = $5`,
      [title.slice(0, 200), price, source, imageUrl, item.id],
    );
    updates.push({
      id: item.id,
      title,
      price: price != null ? String(price) : null,
      source,
    });
    console.log("ENRICHED", title.slice(0, 80), price, source);
  }

  await db.close();
  console.log(JSON.stringify({ ok: true, updated: updates.length, updates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
