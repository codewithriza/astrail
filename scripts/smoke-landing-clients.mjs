import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const browserErrors = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.match(await page.locator("h1").innerText(), /MCP server/);
    assert.equal(await page.locator(".hero-ctas a").first().getAttribute("href"), "/signup");

    // A preview must never claim to have provisioned a server.
    await page.getByRole("button", { name: "Preview MCP setup" }).click();
    assert.match(await page.locator(".demo-drop").innerText(), /Example only/);
    assert.equal(await page.locator(".demo-drop a").getAttribute("href"), "/dashboard/generate");

    const snippets = [];
    for (const label of ["CLI", "HTTP", "MCP stdio"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      const snippet = await page.locator(".code-block code").innerText();
      snippets.push(snippet);
      await page.getByRole("button", { name: "Copy example" }).click();
      await page.getByRole("status").filter({ hasText: "Copied to clipboard." }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), snippet);
    }
    assert.equal(new Set(snippets).size, 3, "Each connection example must contain different usable code.");
    assert.match(snippets[0], /node bin\/astrail.mjs tools list/);
    assert.match(snippets[1], /"method":"tools\/list"/);
    assert.equal(JSON.parse(snippets[2]).mcpServers.astrail.args[1], "mcp");

    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async () => { throw new Error("Permission denied"); } });
    });
    await page.getByRole("button", { name: "Copy example" }).click();
    await page.getByRole("status").filter({ hasText: "Copy unavailable." }).waitFor();

    const plans = page.locator("#pricing .plan");
    assert.equal(await plans.count(), 3);
    for (const [index, name, price, endpoints, href] of [
      [0, "Free", "$0", "3 hosted endpoints", "/signup"],
      [1, "Launch", "$19", "10 hosted endpoints", "/signup?plan=starter"],
      [2, "Scale", "$99", "100 hosted endpoints", "/signup?plan=team"],
    ]) {
      const plan = plans.nth(index);
      assert.ok((await plan.innerText()).includes(name));
      assert.ok((await plan.innerText()).includes(price));
      assert.ok((await plan.innerText()).includes(endpoints));
      assert.equal(await plan.locator("a").getAttribute("href"), href);
    }
    assert.equal(await page.getByRole("button", { name: "Yearly", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Page must fit the viewport.");
    assert.deepEqual(browserErrors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("PASS: desktop and mobile landing examples, real clipboard success/failure, honest preview, and enforced pricing.");
