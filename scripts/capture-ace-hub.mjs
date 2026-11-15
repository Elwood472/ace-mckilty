/**
 * Screenshots for Ace McKilty public hub.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const ARTIFACTS = "/tmp/cursor/walkthrough-artifacts";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const CHROME =
  process.env.CHROME_PATH ||
  "/home/ubuntu/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome";

await mkdir(MEDIA, { recursive: true });
await mkdir(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
});

async function shot(page, name) {
  const mediaPath = path.join(MEDIA, name);
  const artPath = path.join(ARTIFACTS, name);
  await page.screenshot({ path: mediaPath, fullPage: false });
  await page.screenshot({ path: artPath, fullPage: false });
  console.log("shot", mediaPath);
}

const desktop = await browser.newPage({
  viewport: { width: 1280, height: 800 },
});
await desktop.goto(`${BASE}/`, { waitUntil: "networkidle" });
await desktop.waitForSelector("text=Ace McKilty");
await desktop.waitForSelector('a:has-text("Gift Registry")');
await desktop.waitForTimeout(600);
await shot(desktop, "67-ace-mckilty-hub.png");

// Gift Registry entry — hover primary CTA so the entry reads clearly
const gift = desktop.locator('a.hub-cta-primary:has-text("Gift Registry")');
await gift.scrollIntoViewIfNeeded();
await gift.hover();
await desktop.waitForTimeout(300);
await shot(desktop, "68-ace-mckilty-hub-gift-link.png");
// Also capture CTA-focused crop for clarity
const box = await gift.boundingBox();
if (box) {
  const clip = {
    x: Math.max(0, box.x - 40),
    y: Math.max(0, box.y - 80),
    width: Math.min(900, box.width + 520),
    height: Math.min(160, box.height + 80),
  };
  await desktop.screenshot({
    path: path.join(MEDIA, "68-ace-mckilty-hub-gift-link.png"),
    clip,
  });
  await desktop.screenshot({
    path: path.join(ARTIFACTS, "68-ace-mckilty-hub-gift-link.png"),
    clip,
  });
}

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
await mobile.waitForSelector('a:has-text("Gift Registry")');
await mobile.waitForTimeout(400);
await shot(mobile, "67-ace-mckilty-hub-mobile.png");

const body = await desktop.locator("body").innerText();
const checks = {
  brand: body.includes("Ace McKilty"),
  gifts: body.includes("Gift Registry"),
  stats: body.includes("Walkabout Mini Golf Stats"),
  wiki: body.includes("Walkabout Mini Golf Wiki"),
};
console.log(JSON.stringify({ ok: true, checks }, null, 2));
await browser.close();
