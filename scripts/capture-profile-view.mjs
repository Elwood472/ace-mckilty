/**
 * Screenshots: modernized View Profile (tabs, no colored rows).
 * Also smoke-checks access-request uses sendEmail stub path.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const ARTIFACTS = "/tmp/cursor/walkthrough-artifacts";
const stamp = Date.now();

await mkdir(MEDIA, { recursive: true });
await mkdir(ARTIFACTS, { recursive: true });

// Static confirm: access request imports sendEmail / accessRequestEmailBody
const accessSrc = readFileSync(
  path.join(
    "/agent/gift-registry/src/app/actions/access.ts",
  ),
  "utf8",
);
if (
  !accessSrc.includes("accessRequestEmailBody") ||
  !accessSrc.includes("sendEmail")
) {
  throw new Error("requestListAccess missing Resend/sendEmail wiring");
}
const emailSrc = readFileSync("/agent/gift-registry/src/lib/email.ts", "utf8");
if (!emailSrc.includes("accessRequestEmailBody") || !emailSrc.includes("api.resend.com")) {
  throw new Error("email.ts missing access-request body or Resend endpoint");
}
console.log("email path OK: access requests share sendEmail/Resend");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

async function shot(name, artName) {
  const mediaPath = path.join(MEDIA, name);
  const artPath = path.join(ARTIFACTS, artName);
  await page.waitForTimeout(250);
  await page.screenshot({ path: mediaPath, fullPage: false });
  await page.screenshot({ path: artPath, fullPage: false });
  console.log("shot", mediaPath);
}

const email = `owner-view-profile-${stamp}@example.com`;
await page.goto(`${BASE}/signup`);
await page.fill("#displayName", "View Profile Tester");
await page.fill("#email", email);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard**"),
  page.click('button:has-text("Create account")'),
]);

// Seed a couple questionnaire answers via edit
await page.goto(`${BASE}/profile/edit`);
await page.fill("#displayName", "View Profile Tester");
await page.click('[role="tab"]:has-text("Food")');
await page.fill("#favoriteFood", "Pad Thai");
await page.click('[role="tab"]:has-text("About you")');
await page.fill("#favoriteColor", "Navy");
await page.click('button:has-text("Save profile")');
await page.waitForSelector("text=Profile saved");

await page.click('a:has-text("View profile")');
await page.waitForURL("**/profile/**");
await page.waitForSelector('[role="tab"][aria-selected="true"]:has-text("Basics")');

// No legacy yellow/green colored cells
const colored = await page.locator(".alt-a, .alt-b, .size-head, .size-a, .size-b").count();
if (colored > 0) throw new Error("Legacy colored profile classes still present");

const tabPad = await page.locator('[role="tab"]').first().evaluate((el) => getComputedStyle(el).padding);
if (tabPad === "0px") throw new Error("View profile tabs unstyled");

await shot("62-view-profile-tabs-basics.png", "view_profile_tabs_basics.png");

await page.click('[role="tab"]:has-text("Food")');
await page.waitForSelector("text=Pad Thai");
await shot("63-view-profile-tabs-food.png", "view_profile_tabs_food.png");

await page.click('[role="tab"]:has-text("About you")');
await page.waitForSelector("text=Navy");
await shot("64-view-profile-tabs-about.png", "view_profile_tabs_about.png");

console.log("OK");
await browser.close();
