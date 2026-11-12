/**
 * Slow, labeled walkthrough for Rick — pauses on each screen.
 * Writes 08-slow-walkthrough.webm and birthday/anniversary screenshots.
 */
import { chromium } from "playwright-core";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const stamp = Date.now();
const videoDir = path.join(process.cwd(), ".data", "slow-video");

await mkdir(videoDir, { recursive: true });
await mkdir(MEDIA, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 900 } },
});
const page = await ctx.newPage();

async function label(text) {
  await page.evaluate((t) => {
    let el = document.getElementById("walk-label");
    if (!el) {
      el = document.createElement("div");
      el.id = "walk-label";
      el.className = "step-label";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function pause(ms = 2200) {
  await page.waitForTimeout(ms);
}

async function signup(name, email) {
  await page.goto(`${BASE}/signup`);
  await label(`Step: Create account — ${name}`);
  await pause(1800);
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await pause(1000);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.click('button[type="submit"]'),
  ]);
}

async function login(email) {
  await page.goto(`${BASE}/login`);
  await label(`Step: Log in — ${email.split("@")[0]}`);
  await pause(1600);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.click('button[type="submit"]'),
  ]);
}

async function signOut() {
  await label("Step: Log out");
  await pause(1000);
  await page.click('button:has-text("Log Out")');
  await page.waitForURL((u) => u.pathname === "/");
  await pause(1200);
}

// 1. Landing
await page.goto(`${BASE}/`);
await label("1 — Landing (classic Gift Registry)");
await pause(2800);

// 2. Owner signup
const ownerEmail = `owner-slow-${stamp}@example.com`;
const buyerEmail = `buyer-slow-${stamp}@example.com`;
await signup("Owner One", ownerEmail);
await label("2 — Home / My Functions (after signup)");
await pause(2800);

// Set birthday on profile
await page.goto(`${BASE}/profile/edit`);
await label("3 — Edit profile (set birthday)");
await pause(2000);
await page.fill('input[name="displayName"]', "Owner One");
await page.fill('input[name="birthday"]', "1985-12-15");
await page.fill('input[name="favoriteColor"]', "Navy blue");
await page.click('button:has-text("Save profile")');
await pause(2000);

// Create group
await page.goto(`${BASE}/dashboard`);
await label("4 — Create group");
await pause(1600);
await page.fill("#name", "Bray Christmas");
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Create group")'),
]);
const groupUrl = page.url();
const invite = (await page.locator("text=Invite code").locator("..").locator("b").first().innerText().catch(async () => {
  // fallback: find bold near invite
  return page.locator("main b").first().innerText();
})).trim();
await label(`5 — Group page (invite: ${invite})`);
await pause(3000);

await signOut();
await signup("Buyer Two", buyerEmail);
await label("6 — Buyer joins with invite code");
await pause(1600);
await page.fill("#code", invite);
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Join group")'),
]);
await pause(2000);

// Buyer birthday
await page.goto(`${BASE}/profile/edit`);
await label("7 — Buyer sets birthday (for home sort)");
await pause(1600);
await page.fill('input[name="birthday"]', "1990-03-02");
await page.click('button:has-text("Save profile")');
await pause(1600);

// Add couple from group
await page.goto(groupUrl);
await label("8 — Add couple with anniversary");
await pause(2000);
await page.fill("#coupleLabel", "Mom & Dad");
const options = await page.locator("#userA option").allTextContents();
// pick Owner One and Buyer Two
const ownerOpt = await page.locator("#userA option", { hasText: "Owner One" }).getAttribute("value");
const buyerOpt = await page.locator("#userB option", { hasText: "Buyer Two" }).getAttribute("value");
if (ownerOpt) await page.selectOption("#userA", ownerOpt);
if (buyerOpt) await page.selectOption("#userB", buyerOpt);
await page.fill("#anniversary", "1995-06-20");
await page.click('button:has-text("Save couple")');
await pause(2500);

await page.goto(`${BASE}/dashboard`);
await label("9 — Home: people by birthday + couples by anniversary");
await pause(4000);
await page.screenshot({
  path: path.join(MEDIA, "08-home-birthdays-anniversaries.png"),
  fullPage: true,
});
await pause(1500);

// Owner adds gift
await signOut();
await login(ownerEmail);
await page.goto(groupUrl);
await page.getByRole("link", { name: /Owner One/ }).first().click();
await page.waitForURL("**/lists/**");
const listUrl = page.url();
await label("10 — Owner adds gift “Last Mug”");
await pause(2000);
await page.fill("#title", "Last Mug");
await page.fill("#category", "Kitchen");
await page.fill("#price", "24");
await page.click('button:has-text("Add item")');
await page.waitForSelector("text=Last Mug");
await pause(2500);
await page.screenshot({
  path: path.join(MEDIA, "09-owner-list-classic.png"),
  fullPage: true,
});

await signOut();
await login(buyerEmail);
await page.goto(listUrl);
await label("11 — Buyer marks “I bought this”");
await pause(2200);
await page.click('button:has-text("I bought this")');
await page.waitForSelector("text=You marked this");
await pause(2800);

await signOut();
await login(ownerEmail);
await page.goto(listUrl);
await label("12 — Owner view: purchase still hidden");
await pause(3500);
await page.screenshot({
  path: path.join(MEDIA, "10-owner-secrecy.png"),
  fullPage: true,
});

await page.goto(`${BASE}/dashboard`);
await label("13 — Final home view (birthdays + anniversaries)");
await pause(4000);
await page.screenshot({
  path: path.join(MEDIA, "11-home-people-couples.png"),
  fullPage: true,
});

await ctx.close();
await browser.close();

const files = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
const dest = path.join(MEDIA, "08-slow-walkthrough.webm");
await copyFile(path.join(videoDir, files[0]), dest);
console.log(
  JSON.stringify(
    { ok: true, invite, groupUrl, video: dest, options },
    null,
    2,
  ),
);
