/**
 * Screenshot Charli's list after gift restore.
 *
 * Requires CAPTURE_EMAIL and CAPTURE_PASSWORD in the environment
 * (never hardcode live credentials in this repo).
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media/66-charli-gifts-restored.png";
const LIST_ID = "205358b7-38cc-4e7c-9a1a-8fb6e04c2ded";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const CHROME =
  process.env.CHROME_PATH ||
  "/home/ubuntu/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome";
const email = process.env.CAPTURE_EMAIL?.trim() ?? "";
const password = process.env.CAPTURE_PASSWORD?.trim() ?? "";

if (!email || !password) {
  console.error(
    "Set CAPTURE_EMAIL and CAPTURE_PASSWORD in the environment before running this script.",
  );
  process.exit(1);
}

await mkdir(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL("**/dashboard**", { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(500);

await page.goto(`${BASE}/lists/${LIST_ID}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Silco", { timeout: 15000 });
await page.waitForTimeout(500);

// Scroll so restored gifts further down are visible in a tall shot
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: OUT, fullPage: true });

const text = await page.locator("body").innerText();
const markers = [
  "Silco",
  "Heimerdinger",
  "Mel",
  "Champion Jinx",
  "Jinx and Vi",
  "Youtooz",
  "Caitlyn",
];
const found = markers.filter((m) => text.includes(m));
console.log(JSON.stringify({ ok: true, out: OUT, found, markerCount: found.length }, null, 2));
await browser.close();
