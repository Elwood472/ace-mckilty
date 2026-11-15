/**
 * Screenshots: tabbed Edit profile with Save visible at top.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const MEDIA =
  "/cursor/stores/bc-3ee3a3f3-3251-459f-b2c6-5979d337cee2/media";
const ARTIFACTS = "/tmp/cursor/walkthrough-artifacts";
const stamp = Date.now();

await mkdir(MEDIA, { recursive: true });
await mkdir(ARTIFACTS, { recursive: true });

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

const email = `owner-profile-tabs-${stamp}@example.com`;
await page.goto(`${BASE}/signup`);
await page.fill("#displayName", "Profile Tabs Tester");
await page.fill("#email", email);
await page.fill("#password", "password123");
await Promise.all([
  page.waitForURL("**/dashboard**"),
  page.click('button:has-text("Create account")'),
]);

await page.goto(`${BASE}/profile/edit`);
await page.waitForSelector('button:has-text("Save profile")');
await page.waitForSelector('[role="tab"][aria-selected="true"]:has-text("Basics")');

// Save must be in the first viewport (no scroll)
const saveBox = await page.locator('button:has-text("Save profile")').boundingBox();
if (!saveBox || saveBox.y > 220) {
  throw new Error(`Save not near top of viewport: y=${saveBox?.y}`);
}

// Tabs should look like distinct buttons (not bare concatenated text)
const tabPad = await page.locator('[role="tab"]').first().evaluate((el) => getComputedStyle(el).padding);
if (tabPad === "0px") {
  throw new Error("Tab buttons have no padding — styles missing");
}

// Long questionnaire sections must not all be visible at once
const aboutVisible = await page.locator("#profile-panel-about").isVisible();
const foodVisible = await page.locator("#profile-panel-food").isVisible();
if (aboutVisible || foodVisible) {
  throw new Error("Non-active tabs should be hidden");
}

await shot("59-profile-edit-tabs-basics.png", "profile_edit_tabs_basics.png");

await page.click('[role="tab"]:has-text("Food")');
await page.waitForSelector('#profile-panel-food:not([hidden])');
await page.waitForSelector("text=Favorite Food Item");
const saveStill = await page.locator('button:has-text("Save profile")').boundingBox();
if (!saveStill || saveStill.y > 220) {
  throw new Error("Save not sticky/visible after tab switch");
}
await shot("60-profile-edit-tabs-food.png", "profile_edit_tabs_food.png");

await page.click('[role="tab"]:has-text("Bernard Pivot")');
await page.waitForSelector('#profile-panel-pivot:not([hidden])');
await page.waitForSelector("text=What Is Your Favorite Word?");
await shot("61-profile-edit-tabs-pivot.png", "profile_edit_tabs_pivot.png");

// Save from Food tab still persists Basics fields (all tabs in DOM)
await page.click('[role="tab"]:has-text("Basics")');
await page.fill("#displayName", "Tabs Saved Name");
await page.click('[role="tab"]:has-text("Food")');
await page.fill("#favoriteFood", "Tacos");
await page.click('button:has-text("Save profile")');
await page.waitForSelector("text=Profile saved");

await page.reload();
await page.waitForSelector("#displayName");
const name = await page.locator("#displayName").inputValue();
await page.click('[role="tab"]:has-text("Food")');
const food = await page.locator("#favoriteFood").inputValue();
console.log({ name, food });
if (name !== "Tabs Saved Name" || food !== "Tacos") {
  throw new Error("Cross-tab save failed");
}

console.log("OK");
await browser.close();
