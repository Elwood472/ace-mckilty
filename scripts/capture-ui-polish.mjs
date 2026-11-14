/**
 * Ordered screenshots for Ace McKilty UI polish (no video, no .data wipe).
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const stamp = Date.now();

await mkdir(MEDIA, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

async function shot(name) {
  const dest = path.join(MEDIA, name);
  await page.waitForTimeout(400);
  await page.screenshot({ path: dest, fullPage: true });
  console.log("shot", dest);
}

async function signup(name, email, password, birthday) {
  await page.goto(`${BASE}/signup`);
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL("**/dashboard**"),
    page.click('button:has-text("Create account")'),
  ]);
  if (birthday) {
    await page.goto(`${BASE}/profile/edit`);
    await page.fill('input[name="birthday"]', birthday);
    await page.click('button:has-text("Save profile")');
    await page.waitForSelector("text=Profile saved");
  }
}

const ownerEmail = `owner-polish-${stamp}@example.com`;
const pass = "password123";

await page.goto(`${BASE}/`);
await shot("40-landing-ace-mckilty.png");

await signup("Owner One", ownerEmail, pass, "1984-12-20");
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector(".home-toolbar");
await shot("41-home-toolbar.png");

await page.goto(`${BASE}/profile/edit`);
await page.waitForSelector("text=Bernard Pivot");
await page.fill('textarea[name="favoriteColor"]', "Blue");
await page.fill('textarea[name="favoriteFood"]', "Pizza");
await shot("42-profile-questionnaire.png");
await page.click('button:has-text("Save profile")');
await page.waitForSelector("text=Profile saved");

await page.goto(`${BASE}/dashboard`);
await page.fill("#invite-email", `buyer-polish-${stamp}@example.com`);
await Promise.all([
  page.waitForSelector("text=Invite created"),
  page.click('button:has-text("Email invite link")'),
]);
await shot("43-email-invite-link.png");

await page.click('a:has-text("Add a gift")');
await page.waitForURL("**/lists/**");
await page.waitForSelector("text=Add a New Gift");
// Add form should be above Gifts panel
const addY = await page.locator(".panel-head:has-text('Add a New Gift')").boundingBox();
const giftsY = await page.locator(".panel-head:has-text('Gifts')").boundingBox();
if (!addY || !giftsY || addY.y >= giftsY.y) {
  throw new Error("Add form is not above the gift list");
}
await page.fill("#url", "https://www.amazon.com/dp/B0EXAMPLE");
await page.click('button:has-text("Auto-fill")');
await page.waitForTimeout(1200);
await page.fill("#title", "Wireless Headphones");
await page.fill("#category", "Electronics");
await page.fill("#price", "79");
await page.fill("#source", "Amazon");
await shot("44-add-gift-autofill-above-list.png");
await Promise.all([
  page.waitForSelector("text=Item added"),
  page.click('button:has-text("Add item")'),
]);
await page.waitForSelector("text=Wireless Headphones");
await shot("45-list-white-sort-headers.png");

await page.goto(`${BASE}/faq`);
await shot("46-faq-ace-mckilty.png");

// Prove data survives a soft navigation round-trip (same DB)
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector("text=Owner One");
await shot("47-home-data-still-there.png");

await browser.close();
console.log(JSON.stringify({ ok: true, ownerEmail }, null, 2));
