import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.match(await page.locator("h1").innerText(), /Ready for agents/);
    assert.equal(await page.getByRole("link", { name: /Get the code/ }).getAttribute("href"), "https://github.com/codewithriza/astrail");
    assert.equal(await page.locator('a[href*="signup"], a[href*="login"], a[href*="payment"]').count(), 0);
    assert.match(await page.locator("main").innerText(), /MIT licensed/i);
    assert.match(await page.locator("pre").innerText(), /npm run demo:offline/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole("link", { name: /Read the docs/ }).click();
    await page.waitForURL("**/docs");
    assert.ok((await page.locator("h1").innerText()).length > 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log("PASS: open-source landing CTAs, preserved docs, no signup links, responsive layout, and clean browser runtime.");
