/**
 * Ordered screenshots for the no-circles / list-access product pass.
 * Writes 30–39 under the project media store.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const MEDIA =
  process.env.MEDIA_DIR ||
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const stamp = Date.now();

await mkdir(MEDIA, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

async function shot(name) {
  const dest = path.join(MEDIA, name);
  await page.waitForTimeout(350);
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

async function signOut() {
  await page.click('button:has-text("Log Out")').catch(() => {});
  await page.goto(`${BASE}/`);
}

// 30 landing
await page.goto(`${BASE}/`);
await shot("30-landing-invite-or-request.png");

// Owner
const ownerEmail = `owner-nocirc-${stamp}@example.com`;
const buyerEmail = `buyer-nocirc-${stamp}@example.com`;
const pass = "password123";

await signup("Owner One", ownerEmail, pass, "1984-12-20");
await shot("31-home-no-circles.png");

await page.goto(`${BASE}/profile/edit`);
await shot("32-profile-edit-modern.png");

// Invite from home
await page.goto(`${BASE}/dashboard`);
await page.fill("#invite-email", buyerEmail);
await Promise.all([
  page.waitForSelector("text=Invite created"),
  page.click('button:has-text("Email magic invite link")'),
]);
const flash = await page.locator("text=/Link: \\/invite\\//").first().textContent();
const invitePath = flash?.match(/\/invite\/[A-Za-z0-9_-]+/)?.[0];
if (!invitePath) throw new Error("No invite path in flash: " + flash);
await shot("33-email-invite-stub.png");

// Buyer signup + accept invite
await signOut();
await signup("Buyer Two", buyerEmail, pass, "1990-06-15");
await page.goto(`${BASE}${invitePath}`);
await Promise.all([
  page.waitForURL("**/lists/**"),
  page.click('button:has-text("Accept invite")'),
]);
await shot("34-list-after-invite-accept.png");

// Buyer home — owner in people list
await page.goto(`${BASE}/dashboard`);
await shot("35-home-people-by-birthday.png");

// Third person requests access
await signOut();
const thirdEmail = `third-nocirc-${stamp}@example.com`;
await signup("Third Friend", thirdEmail, pass, "1988-03-01");
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector("#people-q");
await page.fill("#people-q", ownerEmail);
await page.waitForSelector(`text=${ownerEmail}`);
await page.waitForSelector('button:has-text("Request access")', {
  timeout: 15000,
});
await Promise.all([
  page.waitForSelector("text=Access requested"),
  page.click('button:has-text("Request access")'),
]);
await shot("36-search-request-access.png");

// Owner approves
await signOut();
await page.goto(`${BASE}/login`);
await page.fill("#email", ownerEmail);
await page.fill("#password", pass);
await Promise.all([
  page.waitForURL("**/dashboard**"),
  page.click('button:has-text("Log In")'),
]);
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector("text=Access requests for your lists", {
  timeout: 15000,
});
await shot("37-access-request-approve.png");
await page.click('button:has-text("Approve")');
await page.waitForTimeout(800);

// Together list
await page.goto(`${BASE}/dashboard`);
await page.fill("#together-title", "Mom & Dad");
await page.fill("#anniversary", "2000-06-20");
const coOwner = page.locator('input[name="ownerIds"]').first();
if (await coOwner.count()) await coOwner.check();
await Promise.all([
  page.waitForURL("**/lists/**"),
  page.click('button:has-text("Create together list")'),
]);
await shot("38-together-list-optional-anniversary.png");

// Add item + filters as owner on personal list
await page.goto(`${BASE}/dashboard`);
await page.click('a.btn:has-text("View My Gifts")');
await page.waitForURL("**/lists/**");
await page.fill("#title", "Wireless Headphones");
await page.fill("#category", "Electronics");
await page.fill("#price", "79");
await page.fill("#url", "https://www.amazon.com/dp/B0TEST");
await Promise.all([
  page.waitForSelector("text=Item added"),
  page.click('button:has-text("Add item")'),
]);
await page.selectOption("#source", "Amazon").catch(() => {});
await page.click('button:has-text("Apply filters")');
await page.waitForTimeout(400);
await shot("39-list-filters-price-store.png");

await browser.close();
console.log(JSON.stringify({ ok: true, invitePath }, null, 2));
