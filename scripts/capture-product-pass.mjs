/**
 * Ordered screenshots for Rick's 2026-11-13 product pass. No video.
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
  await page.waitForTimeout(350);
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
  await page.click('button:has-text("Save profile")');
  await page.waitForTimeout(400);
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

await page.goto(`${BASE}/`);
await shot("21-landing-friend-circles.png");

const owner = `owner-prod-${stamp}@example.com`;
const buyer = `buyer-prod-${stamp}@example.com`;

await signup("Owner One", owner, "1984-12-20");
await shot("22-profile-edit-modern.png");

await page.goto(`${BASE}/dashboard`);
await page.fill("#name", "Bray Family");
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Create friend circle")'),
]);
const groupUrl = page.url();
const invite = (await page.locator("main b").first().innerText()).trim();

// Duplicate name should fail
await page.goto(`${BASE}/dashboard`);
await page.fill("#name", "Bray Family");
await page.click('button:has-text("Create friend circle")');
await page.waitForSelector("text=already have a friend circle");
await shot("23-duplicate-circle-name-blocked.png");

await page.goto(groupUrl);
await shot("24-circle-page-no-couples.png");

await signOut();
await signup("Buyer Two", buyer, "1991-03-08");
await page.goto(`${BASE}/dashboard`);
await page.fill("#code", invite);
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Join circle")'),
]);

await page.goto(`${BASE}/dashboard`);
await shot("25-home-birthdays-no-couples-table.png");

await page.goto(groupUrl);
await page.fill("#title", "Mom & Dad");
await page.fill("#anniversary", "1995-06-20");
const ownerOpt = await page
  .locator('input[name="ownerIds"]')
  .first()
  .getAttribute("value");
if (ownerOpt) {
  await page.locator(`input[name="ownerIds"][value="${ownerOpt}"]`).check();
}
await Promise.all([
  page.waitForURL("**/lists/**"),
  page.click('button:has-text("Create together list")'),
]).catch(async () => {
  // if redirect failed, still on group — continue
});
await page.goto(groupUrl);
await shot("26-together-list-optional-anniversary.png");

// Invite email stub message
await page.fill("#email", `invitee-${stamp}@example.com`);
await page.click('button:has-text("Email invite link")');
await page.waitForSelector("text=Invite");
await shot("27-email-invite-stub.png");

await signOut();
await login(owner);
await page.goto(groupUrl);
await page.getByRole("link", { name: /Owner One/ }).first().click();
await page.waitForURL("**/lists/**");
await page.fill("#title", "Wireless Headphones");
await page.fill("#category", "Electronics");
await page.fill("#price", "79");
await page.fill("#url", "https://www.amazon.com/dp/B0TEST1234");
await page.click('button:has-text("Add item")');
await page.waitForSelector("text=Wireless Headphones");
await page.selectOption("#source", { label: "Amazon" }).catch(() => {});
await shot("28-list-filters-price-store.png");

// Apply store filter
await page.selectOption("#source", "Amazon");
await page.click('button:has-text("Apply filters")');
await page.waitForTimeout(500);
await shot("29-list-filtered-by-amazon.png");

await browser.close();
console.log(JSON.stringify({ ok: true, invite, groupUrl }, null, 2));
