/**
 * Steady numbered screenshots only (no video).
 * Seeds a rich birthday/anniversary home, then captures legacy-look pages in order.
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

async function signup(name, email, birthday) {
  await page.goto(`${BASE}/signup`);
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/profile/edit`);
  await page.fill('input[name="birthday"]', birthday);
  await page.fill('input[name="favoriteColor"]', "Navy");
  await page.fill('input[name="height"]', "5'10\"");
  await page.click('button:has-text("Save profile")');
  await page.waitForTimeout(500);
}

async function login(email) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.click('button[type="submit"]'),
  ]);
}

async function signOut() {
  await page.click('button:has-text("Log Out")');
  await page.waitForURL((u) => u.pathname === "/");
}

// Landing
await page.goto(`${BASE}/`);
await shot("12-landing-legacy.png");

await page.goto(`${BASE}/login`);
await shot("13-login-legacy.png");

const owner = `owner-shot-${stamp}@example.com`;
const buyer = `buyer-shot-${stamp}@example.com`;
const third = `third-shot-${stamp}@example.com`;

await signup("Owner One", owner, "1984-12-20");
await page.goto(`${BASE}/dashboard`);
await page.fill("#name", "Bray Family");
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Create group")'),
]);
const groupUrl = page.url();
const invite = (await page.locator("main b").first().innerText()).trim();
await shot("14-group-legacy.png");

await signOut();
await signup("Buyer Two", buyer, "1991-03-08");
await page.goto(`${BASE}/dashboard`);
await page.fill("#code", invite);
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Join group")'),
]);

await signOut();
await signup("Third Three", third, "1988-07-04");
await page.goto(`${BASE}/dashboard`);
await page.fill("#code", invite);
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Join group")'),
]);

// Couple with anniversary
await page.goto(groupUrl);
await page.fill("#coupleLabel", "Mom & Dad");
const ownerVal = await page
  .locator("#userA option", { hasText: "Owner One" })
  .getAttribute("value");
const buyerVal = await page
  .locator("#userB option", { hasText: "Buyer Two" })
  .getAttribute("value");
await page.selectOption("#userA", ownerVal);
await page.selectOption("#userB", buyerVal);
await page.fill("#anniversary", "1995-06-20");
await page.click('button:has-text("Save couple")');
await page.waitForTimeout(800);
await shot("15-group-couple-anniversary.png");

// Home with birthdays + anniversaries
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector("text=People you can buy for");
await page.waitForSelector("text=Couples / anniversaries");
await shot("16-home-birthdays-anniversaries.png");

// Scroll-focused crop isn't needed — full page shows both tables
await page.locator("text=Couples / anniversaries").scrollIntoViewIfNeeded();
await shot("17-home-anniversaries-focus.png");

// Profile
await page.goto(`${BASE}/profile/edit`);
await shot("18-profile-edit-legacy.png");

// Gift list classic
await signOut();
await login(owner);
await page.goto(groupUrl);
await page.getByRole("link", { name: /Owner One/ }).first().click();
await page.waitForURL("**/lists/**");
await page.fill("#title", "Last Mug");
await page.fill("#category", "Kitchen");
await page.fill("#price", "24");
await page.click('button:has-text("Add item")');
await page.waitForSelector("text=Last Mug");
await shot("19-gift-list-legacy.png");

// FAQ
await page.goto(`${BASE}/faq`);
await shot("20-faq-legacy.png");

await browser.close();
console.log(JSON.stringify({ ok: true, invite, groupUrl }, null, 2));
