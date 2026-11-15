/**
 * Screenshot: Amazon Auto-fill uses buy-box / one-time purchase price
 * (not nav "Under $10" / related SKUs).
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const ARTIFACTS = "/tmp/cursor/walkthrough-artifacts";
const stamp = Date.now();
const AMAZON_URL =
  "https://www.amazon.com/Funko-Pop-Animation-Legends-Caitlyn/dp/B0D6D5PZGJ";

await mkdir(MEDIA, { recursive: true });
await mkdir(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const email = `owner-amazon-bb-${stamp}@example.com`;
const pass = "password123";

await page.goto(`${BASE}/signup`);
await page.fill("#displayName", "Amazon BuyBox Tester");
await page.fill("#email", email);
await page.fill("#password", pass);
await Promise.all([
  page.waitForURL("**/dashboard**"),
  page.click('button:has-text("Create account")'),
]);

await page.goto(`${BASE}/dashboard`);
await page.click('a:has-text("Add a gift")');
await page.waitForURL("**/lists/**/add**");
await page.waitForSelector("text=New gift");

await page.fill("#url", AMAZON_URL);
await page.click('button:has-text("Auto-fill")');
// Wait until price field is populated with a buy-box-ish amount (not 10)
await page.waitForFunction(
  () => {
    const el = document.querySelector("#price, input[name='price']");
    if (!el) return false;
    const v = el.value.trim();
    const n = Number(v);
    return v && n >= 15 && n <= 25 && n !== 10;
  },
  { timeout: 20000 },
);

const price = await page.locator("#price, input[name='price']").first().inputValue();
const title = await page.locator("input[name='title']").first().inputValue();
const source = await page.locator("input[name='source'], select[name='source']").first().inputValue();
console.log({ price, title: title.slice(0, 80), source });

const mediaName = "55-autofill-amazon-buybox-price.png";
const mediaPath = path.join(MEDIA, mediaName);
const artPath = path.join(ARTIFACTS, "autofill_amazon_buybox_price.png");
await page.screenshot({ path: mediaPath, fullPage: true });
await page.screenshot({ path: artPath, fullPage: true });
console.log("shot", mediaPath);
console.log("artifact", artPath);

if (Number(price) === 10) {
  console.error("FAIL: still $10");
  process.exit(1);
}
if (!(Number(price) >= 15 && Number(price) <= 25)) {
  console.error("FAIL: price not in buy-box band", price);
  process.exit(1);
}

await browser.close();
console.log("OK");
