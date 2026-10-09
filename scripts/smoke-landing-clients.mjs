import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    let submitted;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/design-partners", async route => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ request: { id: "smoke" } }) });
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.match(await page.locator("h1").innerText(), /Ready for agents/);
    assert.equal(await page.locator("#hero").getByRole("link", { name: /Get the code/ }).getAttribute("href"), "https://github.com/codewithriza/astrail");
    assert.equal(await page.locator('a[href*="signup"], a[href*="login"], a[href*="payment"]').count(), 0);
    assert.match(await page.locator("main").innerText(), /MIT licensed/i);
    assert.match(await page.locator("pre").innerText(), /npm run demo:offline/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (viewport.width < 800) {
      await page.getByRole("button", { name: "Open menu" }).click();
      assert.equal(await page.getByRole("dialog", { name: "Site menu" }).count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog", { name: "Site menu" }).count(), 0);
    }
    const form = page.getByRole("form", { name: "Contact the Astrail team" });
    await form.getByRole("button", { name: /send it!/ }).click();
    assert.equal(await form.locator('[name="name"]').getAttribute("aria-invalid"), "true");
    await form.locator('[name="name"]').fill("Astrail Test");
    await form.locator('[name="email"]').fill("test@example.com");
    await form.locator('[name="message"]').fill("I want to turn an API into agent tools.");
    await form.getByRole("button", { name: /send it!/ }).click();
    await page.getByRole("status").getByText("message received!").waitFor();
    assert.equal(submitted.email, "test@example.com");
    assert.equal(submitted.persona, "developer");
    assert.match(submitted.workflow_goal, /turn an API into agent tools/);
    await page.locator("#hero").getByRole("link", { name: /Read the docs/ }).click();
    await page.waitForURL("**/docs");
    assert.ok((await page.locator("h1").innerText()).length > 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log("PASS: pixel landing CTAs, contact form, mobile menu, docs, responsive layout, and clean browser runtime.");
