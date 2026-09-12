import { chromium } from "playwright";

const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const serverId = process.env.ASTRAIL_PUBLISH_TOGGLE_SERVER_ID ?? "local-website-mcp";

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function retry(label, fn, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function resetVisibility(isPublic) {
  const { response, payload } = await retry("reset visibility", async () => {
    const response = await fetch(`${baseUrl}/api/servers/${serverId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_public: isPublic }),
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  });

  if (!response.ok || payload?.server?.is_public !== isPublic) {
    fail(`could not reset ${serverId} visibility`, JSON.stringify(payload, null, 2));
  }
}

async function main() {
  await resetVisibility(false);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 240 } });

  try {
    await retry("open server detail page", () => page.goto(`${baseUrl}/dashboard/servers/${serverId}`, { waitUntil: "networkidle" }));

    const makePublic = page.getByRole("button", { name: /make public/i });
    await makePublic.waitFor({ state: "visible", timeout: 10000 });
    await makePublic.click();

    const publishing = page.getByRole("button", { name: /publishing/i });
    await publishing.waitFor({ state: "visible", timeout: 3000 });
    if (!(await publishing.isDisabled())) {
      fail("publish button was not disabled while publishing");
    }

    const makePrivate = page.getByRole("button", { name: /make private/i });
    await makePrivate.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1200);

    if (await page.getByRole("button", { name: /make public/i }).isVisible().catch(() => false)) {
      fail("publish button reverted to Make public after a successful publish");
    }

    await makePrivate.click();
    const makingPrivate = page.getByRole("button", { name: /making private/i });
    await makingPrivate.waitFor({ state: "visible", timeout: 3000 });
    if (!(await makingPrivate.isDisabled())) {
      fail("publish button was not disabled while making private");
    }

    await page.getByRole("button", { name: /make public/i }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1200);

    if (await page.getByRole("button", { name: /make private/i }).isVisible().catch(() => false)) {
      fail("publish button reverted to Make private after a successful private toggle");
    }
  } finally {
    await browser.close();
    await resetVisibility(false);
  }

  console.log("PASS: publish toggle stays on the updated action after refresh and is disabled while pending.");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown publish toggle smoke failure"));
