/**
 * Smoke: Amazon buy-box selection beats nav decoys like "Under $10".
 * Run: npx tsx scripts/autofill-amazon-check.ts
 */
import { autofillFromGiftUrl } from "../src/lib/autofill";

async function main() {
  const url =
    "https://www.amazon.com/Funko-Pop-Animation-Legends-Caitlyn/dp/B0D6D5PZGJ";
  const live = await autofillFromGiftUrl(url);
  console.log(JSON.stringify(live, null, 2));
  const price = Number(live.price);
  if (!(price >= 15 && price <= 25)) {
    console.error(
      "FAIL: live price out of expected buy-box band (~17)",
      live.price,
    );
    process.exit(1);
  }
  if (price === 10) {
    console.error("FAIL: still picking nav Under $10");
    process.exit(1);
  }
  console.log("OK: buy-box band price", live.price);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
