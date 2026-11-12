import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MEDIA =
  process.env.MEDIA_DIR ??
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const stamp = Date.now();

await mkdir(MEDIA, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function freshPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  return { ctx, page };
}

async function signup(page, name, email) {
  await page.goto(`${BASE}/signup`);
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.click('button[type="submit"]'),
  ]);
}

async function signOut(page) {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL((u) => u.pathname === "/");
}

const results = {};

// Landing
{
  const { ctx, page } = await freshPage();
  await page.goto(`${BASE}/`);
  await page.screenshot({ path: path.join(MEDIA, "01-landing.png"), fullPage: true });
  results.landing = await page.locator("text=Gift Registry").count();
  await ctx.close();
}

const owner = await freshPage();
await signup(owner.page, "Owner One", `owner-full-${stamp}@example.com`);
await owner.page.fill("#name", `Bray Christmas ${stamp}`);
await Promise.all([
  owner.page.waitForURL("**/groups/**"),
  owner.page.click('button:has-text("Create group")'),
]);
const groupUrl = owner.page.url();
const inviteCode = (await owner.page.locator("code").first().innerText()).trim();
await owner.page.screenshot({
  path: path.join(MEDIA, "02-group-page.png"),
  fullPage: true,
});
results.groupCreated = groupUrl.includes("/groups/");
results.inviteCode = inviteCode;
console.log("group", groupUrl, "invite", inviteCode);

await signOut(owner.page);

const buyer = await freshPage();
await signup(buyer.page, "Buyer Two", `buyer-full-${stamp}@example.com`);
await buyer.page.fill("#code", inviteCode);
await Promise.all([
  buyer.page.waitForURL("**/groups/**"),
  buyer.page.click('button:has-text("Join group")'),
]);
results.buyerJoined = buyer.page.url().includes("/groups/");
await signOut(buyer.page);

const third = await freshPage();
await signup(third.page, "Third Three", `third-full-${stamp}@example.com`);
await third.page.fill("#code", inviteCode);
await Promise.all([
  third.page.waitForURL("**/groups/**"),
  third.page.click('button:has-text("Join group")'),
]);
results.thirdJoined = third.page.url().includes("/groups/");
await signOut(third.page);

// Owner adds item
await owner.page.goto(`${BASE}/login`);
await owner.page.fill("#email", `owner-full-${stamp}@example.com`);
await owner.page.fill("#password", "password123");
await Promise.all([
  owner.page.waitForURL("**/dashboard"),
  owner.page.click('button[type="submit"]'),
]);
await owner.page.goto(groupUrl);
await owner.page.click('a:has-text("Owner One")');
await owner.page.waitForURL("**/lists/**");
const listUrl = owner.page.url();
await owner.page.fill("#title", "Last Mug");
await owner.page.fill("#category", "Kitchen");
await owner.page.fill("#price", "24");
await owner.page.selectOption("#qtyMode", "1");
await owner.page.click('button:has-text("Add item")');
await owner.page.waitForSelector("text=Last Mug");
results.itemAdded = true;
await owner.page.screenshot({
  path: path.join(MEDIA, "03-owner-list-before-purchase.png"),
  fullPage: true,
});

// Buyer purchases
await buyer.page.goto(`${BASE}/login`);
await buyer.page.fill("#email", `buyer-full-${stamp}@example.com`);
await buyer.page.fill("#password", "password123");
await Promise.all([
  buyer.page.waitForURL("**/dashboard"),
  buyer.page.click('button[type="submit"]'),
]);
await buyer.page.goto(listUrl);
await buyer.page.click('button:has-text("I bought this")');
await buyer.page.waitForSelector("text=You marked this");
results.buyerMarked = true;
await buyer.page.screenshot({
  path: path.join(MEDIA, "04-buyer-marked.png"),
  fullPage: true,
});

// Owner secrecy
await owner.page.goto(listUrl);
await owner.page.waitForSelector("text=Last Mug");
const ownerTaken = await owner.page.locator("text=Taken").count();
const ownerPurchased = await owner.page.locator("text=Purchased").count();
const ownerBuy = await owner.page.locator('button:has-text("I bought this")').count();
results.ownerSecrecy = ownerTaken === 0 && ownerPurchased === 0 && ownerBuy === 0;
await owner.page.screenshot({
  path: path.join(MEDIA, "05-owner-after-purchase-secret.png"),
  fullPage: true,
});

// Third sees taken
await third.page.goto(`${BASE}/login`);
await third.page.fill("#email", `third-full-${stamp}@example.com`);
await third.page.fill("#password", "password123");
await Promise.all([
  third.page.waitForURL("**/dashboard"),
  third.page.click('button[type="submit"]'),
]);
await third.page.goto(listUrl);
await third.page.waitForSelector("text=Taken");
const thirdTaken = await third.page.locator("text=Taken").count();
const thirdBuy = await third.page.locator('button:has-text("I bought this")').count();
results.thirdSeesTaken = thirdTaken >= 1 && thirdBuy === 0;
await third.page.screenshot({
  path: path.join(MEDIA, "06-third-sees-taken.png"),
  fullPage: true,
});

// Race: try mark again via a fourth attempt isn't needed; third can't buy.
// Buyer put-back then re-claim last unit race via API smoke already covered.

results.ok =
  results.landing > 0 &&
  results.groupCreated &&
  results.buyerJoined &&
  results.thirdJoined &&
  results.itemAdded &&
  results.buyerMarked &&
  results.ownerSecrecy &&
  results.thirdSeesTaken;

console.log(JSON.stringify(results, null, 2));

await owner.ctx.close();
await buyer.ctx.close();
await third.ctx.close();
await browser.close();
process.exit(results.ok ? 0 : 1);
