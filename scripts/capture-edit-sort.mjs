/**
 * Screenshots: gift edit + default category/title sort.
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

async function shot(name, artName) {
  const mediaPath = path.join(MEDIA, name);
  const artPath = path.join(ARTIFACTS, artName);
  await page.waitForTimeout(300);
  await page.screenshot({ path: mediaPath, fullPage: true });
  await page.screenshot({ path: artPath, fullPage: true });
  console.log("shot", mediaPath);
}

const email = `owner-edit-sort-${stamp}@example.com`;
const pass = "password123";

await page.goto(`${BASE}/signup`);
await page.fill("#displayName", "Edit Sort Tester");
await page.fill("#email", email);
await page.fill("#password", pass);
await Promise.all([
  page.waitForURL("**/dashboard**"),
  page.click('button:has-text("Create account")'),
]);

// Add three gifts in non-category order so sort is visible
const gifts = [
  { title: "Zebra Mug", category: "Kitchen", price: "12" },
  { title: "Apple Watch Band", category: "Tech", price: "29" },
  { title: "Baking Sheet", category: "Kitchen", price: "18" },
];

await page.goto(`${BASE}/dashboard`);
await page.click('a:has-text("Add a gift")');
await page.waitForURL("**/add**");

for (const g of gifts) {
  await page.fill("#title", g.title);
  await page.fill("#category", g.category);
  await page.fill("#price", g.price);
  await Promise.all([
    page.waitForSelector("text=Item added"),
    page.click('button:has-text("Add item")'),
  ]);
  await page.waitForTimeout(400);
}

// My gifts list — default sort should be Kitchen (Baking Sheet, Zebra Mug), then Tech
await page.click('a:has-text("My gifts")');
await page.waitForURL(/\/lists\/[^/]+$/);
await page.waitForSelector("text=Gifts");

const titles = await page.locator("table.legacy-table tbody tr td:first-child").allTextContents();
const cleaned = titles.map((t) => t.replace(/\s+/g, " ").trim());
console.log("row titles:", cleaned);

const sortSelect = page.locator("#sort");
const sortVal = await sortSelect.inputValue();
console.log("default sort select:", sortVal);
if (sortVal !== "category") {
  throw new Error(`Expected default sort=category, got ${sortVal}`);
}

// Expect Kitchen items before Tech; within Kitchen, Baking before Zebra
const joined = cleaned.join(" | ");
const baking = cleaned.findIndex((t) => t.includes("Baking Sheet"));
const zebra = cleaned.findIndex((t) => t.includes("Zebra Mug"));
const apple = cleaned.findIndex((t) => t.includes("Apple Watch Band"));
console.log({ baking, zebra, apple });
if (!(baking >= 0 && zebra >= 0 && apple >= 0)) {
  throw new Error("Missing expected gifts in list");
}
if (!(baking < zebra && zebra < apple)) {
  throw new Error(`Bad default order: ${joined}`);
}

await shot("56-list-default-sort-category-title.png", "list_default_sort_category_title.png");

// Open edit for Zebra Mug
await page.locator("tr", { hasText: "Zebra Mug" }).locator('a:has-text("Edit")').click();
await page.waitForURL("**/edit**");
await page.waitForSelector("text=Edit gift");
await page.waitForSelector("#title");

const titleBefore = await page.locator("#title").inputValue();
if (!titleBefore.includes("Zebra")) throw new Error("Edit form not prefilled");

await page.fill("#title", "Zebra Ceramic Mug");
await page.fill("#notes", "Prefer matte black");
await shot("57-edit-gift-form.png", "edit_gift_form.png");

await Promise.all([
  page.waitForURL(/\/lists\/[^/]+$/),
  page.click('button:has-text("Save changes")'),
]);
await page.waitForSelector("text=Zebra Ceramic Mug");
await shot("58-edit-gift-saved.png", "edit_gift_saved.png");

console.log("OK");
await browser.close();
