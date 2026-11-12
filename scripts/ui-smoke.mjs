import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
page.on("requestfailed", (req) =>
  console.log("REQFAIL", req.url(), req.failure()?.errorText),
);

async function signup(name, email) {
  await page.goto(`${BASE}/signup`);
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  const csrf = await page.locator('input[name="csrf"]').inputValue();
  console.log("csrf on signup", csrf ? csrf.slice(0, 8) : "(empty)");
  await Promise.all([
    page.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log("after signup", page.url());
}

await signup("Owner UI", `owner-ui-${stamp}@example.com`);

const csrfDash = await page.locator('input[name="csrf"]').first().inputValue();
console.log("csrf on dashboard", csrfDash ? csrfDash.slice(0, 8) : "(empty)");
await page.fill("#name", `Group ${stamp}`);

const [response] = await Promise.all([
  page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/dashboard"), {
    timeout: 15000,
  }).catch((e) => {
    console.log("no POST", e.message);
    return null;
  }),
  page.click('button:has-text("Create group")'),
]);

if (response) {
  console.log("POST status", response.status(), response.url());
  const body = await response.text();
  console.log("POST body head", body.slice(0, 300));
}

await page.waitForTimeout(1500);
console.log("url after create click", page.url());
const err = await page.locator(".text-danger, .bg-red-50").allTextContents();
console.log("errors", err);
const html = await page.content();
console.log("has group link?", html.includes(`/groups/`));

await browser.close();
