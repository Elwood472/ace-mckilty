/**
 * End-to-end HTTP smoke against a running local server.
 * Exercises signup → group → item → purchase secrecy via Server Actions.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROME ||
      "/usr/bin/google-chrome" ||
      "/usr/bin/chromium-browser",
    headless: true,
  });
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  const buyer = await ctx.browser().newContext().then((c) => c.newPage());
  const third = await ctx.browser().newContext().then((c) => c.newPage());

  const stamp = Date.now();

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

  await signup(owner, "Owner One", `owner-${stamp}@example.com`);
  await owner.fill("#name", `Holiday ${stamp}`);
  await Promise.all([
    owner.waitForURL("**/groups/**"),
    owner.click('button:has-text("Create group")'),
  ]);
  const groupUrl = owner.url();
  const inviteCode = await owner
    .locator("code")
    .first()
    .innerText();

  await signup(buyer, "Buyer Two", `buyer-${stamp}@example.com`);
  await buyer.fill("#code", inviteCode);
  await Promise.all([
    buyer.waitForURL("**/groups/**"),
    buyer.click('button:has-text("Join group")'),
  ]);

  await signup(third, "Third Three", `third-${stamp}@example.com`);
  await third.fill("#code", inviteCode);
  await Promise.all([
    third.waitForURL("**/groups/**"),
    third.click('button:has-text("Join group")'),
  ]);

  // Owner opens own list and adds qty=1 item
  await owner.goto(groupUrl);
  await owner.click('a:has-text("Owner One")');
  await owner.fill("#title", "Last Mug");
  await owner.selectOption("#qtyMode", "1");
  await owner.click('button:has-text("Add item")');
  await owner.waitForSelector("text=Last Mug");

  const listUrl = owner.url();

  // Buyer marks purchased
  await buyer.goto(listUrl);
  await buyer.click('button:has-text("I bought this")');
  await buyer.waitForSelector("text=You marked this");

  // Owner still sees available (no Taken)
  await owner.goto(listUrl);
  const ownerTaken = await owner.locator("text=Taken").count();
  const ownerBoughtBtn = await owner.locator('button:has-text("I bought this")').count();
  const ownerRemove = await owner.locator('button:has-text("Remove")').count();

  // Third sees Taken
  await third.goto(listUrl);
  await third.waitForSelector("text=Taken");

  // Race: third tries anyway if button somehow present — expect Taken only
  const thirdBuy = await third.locator('button:has-text("I bought this")').count();

  console.log(
    JSON.stringify(
      {
        groupUrl,
        listUrl,
        inviteCode,
        ownerTaken,
        ownerBoughtBtn,
        ownerRemove,
        thirdBuy,
        ok:
          ownerTaken === 0 &&
          ownerBoughtBtn === 0 &&
          ownerRemove >= 1 &&
          thirdBuy === 0,
      },
      null,
      2,
    ),
  );

  await browser.close();
  process.exit(
    ownerTaken === 0 && ownerBoughtBtn === 0 && ownerRemove >= 1 && thirdBuy === 0
      ? 0
      : 1,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
