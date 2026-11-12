import { chromium } from "playwright-core";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

const BASE = "http://localhost:3000";
const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const stamp = Date.now();
const videoDir = path.join(process.cwd(), ".data", "video");
await mkdir(videoDir, { recursive: true });
await mkdir(MEDIA, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
});
const page = await ctx.newPage();

await page.goto(`${BASE}/`);
await page.waitForTimeout(800);
await page.click('a:has-text("Create account")');
await page.fill("#displayName", "Demo Owner");
await page.fill("#email", `demo-owner-${stamp}@example.com`);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.click('button[type="submit"]'),
]);
await page.fill("#name", "Demo Christmas");
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Create group")'),
]);
const groupUrl = page.url();
const invite = (await page.locator("code").first().innerText()).trim();
await page.waitForTimeout(600);

await page.click('button:has-text("Sign out")');
await page.waitForURL((u) => u.pathname === "/");
await page.click('a:has-text("Create account")');
await page.fill("#displayName", "Demo Buyer");
await page.fill("#email", `demo-buyer-${stamp}@example.com`);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.click('button[type="submit"]'),
]);
await page.fill("#code", invite);
await Promise.all([
  page.waitForURL("**/groups/**"),
  page.click('button:has-text("Join group")'),
]);
await page.waitForTimeout(500);

await page.click('button:has-text("Sign out")');
await page.waitForURL((u) => u.pathname === "/");
await page.click('a:has-text("Sign in")');
await page.fill("#email", `demo-owner-${stamp}@example.com`);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.click('button[type="submit"]'),
]);
await page.goto(groupUrl);
await page.click('a:has-text("Demo Owner")');
await page.fill("#title", "Secret Scarf");
await page.fill("#category", "Fashion");
await page.fill("#price", "35");
await page.click('button:has-text("Add item")');
await page.waitForSelector("text=Secret Scarf");
const listUrl = page.url();
await page.waitForTimeout(700);

await page.click('button:has-text("Sign out")');
await page.waitForURL((u) => u.pathname === "/");
await page.click('a:has-text("Sign in")');
await page.fill("#email", `demo-buyer-${stamp}@example.com`);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.click('button[type="submit"]'),
]);
await page.goto(listUrl);
await page.click('button:has-text("I bought this")');
await page.waitForSelector("text=You marked this");
await page.waitForTimeout(900);

await page.click('button:has-text("Sign out")');
await page.waitForURL((u) => u.pathname === "/");
await page.click('a:has-text("Sign in")');
await page.fill("#email", `demo-owner-${stamp}@example.com`);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.click('button[type="submit"]'),
]);
await page.goto(listUrl);
await page.waitForSelector("text=Secret Scarf");
await page.waitForTimeout(1200);

await ctx.close();
await browser.close();

const files = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
if (!files.length) throw new Error("No video recorded");
const dest = path.join(MEDIA, "07-secret-purchase-demo.webm");
await copyFile(path.join(videoDir, files[0]), dest);
console.log("wrote", dest);
