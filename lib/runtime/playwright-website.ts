import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import { chromium as localChromium, type Browser, type Page } from "playwright";
import { assertSafeUpstreamUrl, isBlockedRuntimeHostname, NetworkPolicyError } from "@/lib/runtime/network-policy";

export type WebsiteActionKind = "open_page" | "follow_link" | "submit_form" | "click";

export type PageControl = {
  kind: WebsiteActionKind;
  label: string;
  selector: string | null;
  method?: string;
  action?: string;
  href?: string;
  inputs?: Array<{ name: string; type: string; required: boolean }>;
};

export type WebsitePageAnalysis = {
  finalUrl: string;
  title: string;
  visibleTextSummary: string;
  links: PageControl[];
  buttons: PageControl[];
  forms: PageControl[];
  screenshotPath: string | null;
  actionHistory: string[];
};

export type WebsiteRuntimeExecution = {
  finalUrl: string;
  title: string;
  visibleTextPreview: string;
  screenshotPath: string | null;
  actionHistory: string[];
};

const BROWSER_TIMEOUT_MS = 15_000;
const MAX_VISIBLE_TEXT_CHARS = 1800;
const MAX_CONTROLS = 12;
const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;
const SENSITIVE_URL_KEYS = /(^|_)(api_?key|access_?token|auth|authorization|bearer|client_?secret|code|password|refresh_?token|secret|signature|token)($|_)/i;

export function redactWebsiteUrlForLog(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_URL_KEYS.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function safeRuntimeError(error: unknown) {
  if (error instanceof NetworkPolicyError) {
    return "Website runtime blocked a non-public network target.";
  }
  const message = error instanceof Error ? error.message : "unknown";
  if (/private|local|blocked|protocol|dns|resolve|network|url/i.test(message)) {
    return "Website runtime blocked a non-public network target.";
  }
  if (/timeout/i.test(message)) return "Website runtime timed out.";
  return "Website runtime could not inspect this page.";
}

export function isBlockedWebsiteHostname(hostname: string) {
  if (isBlockedRuntimeHostname(hostname)) return true;
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(lower);
  if (ipVersion === 4) {
    const parts = lower.split(".").map((part) => Number(part));
    const [first = 0, second = 0] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }
  if (ipVersion === 6) {
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.")
    );
  }
  return (
    lower === "localhost" ||
    lower.endsWith(".local") ||
    lower === "0.0.0.0" ||
    lower.startsWith("127.") ||
    lower.startsWith("10.") ||
    lower.startsWith("169.254.") ||
    lower.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)
  );
}

export function assertPublicWebsiteUrl(inputUrl: string) {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new Error("Enter a valid website URL.");
  }

  if (!["http:", "https:"].includes(url.protocol) || isBlockedWebsiteHostname(url.hostname)) {
    throw new Error("Website runtime only supports public http/https URLs.");
  }

  return url;
}

async function assertSafePublicWebsiteUrl(target: URL) {
  assertPublicWebsiteUrl(target.toString());
  await assertSafeUpstreamUrl(target);
  return target;
}

function sameOriginPublicUrl(rawUrl: string | null, baseUrl: URL) {
  if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("mailto:") || rawUrl.startsWith("tel:")) return null;
  try {
    const target = new URL(rawUrl, baseUrl);
    if (!["http:", "https:"].includes(target.protocol)) return null;
    if (target.hostname !== baseUrl.hostname) return null;
    if (isBlockedWebsiteHostname(target.hostname)) return null;
    return target;
  } catch {
    return null;
  }
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser(actionHistory?: string[]) {
  if (isServerlessRuntime()) {
    try {
      const [{ default: serverlessChromium }, { chromium: serverlessPlaywright }] = await Promise.all([
        import("@sparticuz/chromium"),
        import("playwright-core"),
      ]);
      const executablePath = await serverlessChromium.executablePath();
      const browser = await serverlessPlaywright.launch({
        args: [...serverlessChromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
        executablePath,
        headless: true,
      });
      actionHistory?.push("serverless_chromium:ready");
      return browser as unknown as Browser;
    } catch (error) {
      actionHistory?.push(`serverless_chromium_unavailable:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return localChromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

async function newRuntimePage(browser: Browser, actionHistory: string[]) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: "AstrailExperimentalBrowserRuntime/0.1",
  });
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    let target: URL;
    try {
      target = new URL(requestUrl);
      if (!["http:", "https:"].includes(target.protocol)) {
        await route.abort("blockedbyclient");
        return;
      }
      await assertSafePublicWebsiteUrl(target);
      await route.continue();
    } catch {
      actionHistory.push(`blocked_request:${redactWebsiteUrlForLog(requestUrl)}`);
      await route.abort("blockedbyclient");
    }
  });
  page.setDefaultTimeout(BROWSER_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(BROWSER_TIMEOUT_MS);
  return page;
}

async function gotoPublic(page: Page, target: URL, actionHistory: string[]) {
  await assertSafePublicWebsiteUrl(target);
  actionHistory.push(`goto:${redactWebsiteUrlForLog(target.toString())}`);
  const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: BROWSER_TIMEOUT_MS });
  const finalUrl = new URL(page.url());
  try {
    await assertSafePublicWebsiteUrl(finalUrl);
  } catch {
    throw new Error("Website runtime blocked a redirect to a private/local address.");
  }
  actionHistory.push(`loaded:${redactWebsiteUrlForLog(page.url())}:${response?.status() ?? "unknown"}`);
  return response?.status() ?? null;
}

async function text(locator: ReturnType<Page["locator"]>, fallback = "") {
  try {
    return (await locator.innerText({ timeout: 1000 })).replace(/\s+/g, " ").trim();
  } catch {
    return fallback;
  }
}

async function attr(locator: ReturnType<Page["locator"]>, name: string) {
  try {
    return await locator.getAttribute(name, { timeout: 1000 });
  } catch {
    return null;
  }
}

async function saveScreenshot(page: Page, traceId: string, suffix: string) {
  if (isServerlessRuntime()) return null;
  const dir = join(process.cwd(), "public", "runtime-artifacts");
  await mkdir(dir, { recursive: true });
  const fileName = `${traceId}-${suffix}.png`;
  await writeFile(join(dir, fileName), await page.screenshot({ fullPage: false }));
  return `/runtime-artifacts/${fileName}`;
}

async function readResponseText(response: Response) {
  if (!response.body) return (await response.text()).slice(0, MAX_HTML_BYTES);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;

  try {
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = Buffer.from(value);
      const remaining = MAX_HTML_BYTES - bytes;
      chunks.push(chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk);
      bytes += Math.min(chunk.byteLength, remaining);
      if (chunk.byteLength > remaining) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString("utf8");
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string) {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function htmlAttr(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

async function fetchPublicHtml(inputUrl: string, actionHistory: string[]) {
  let target = assertPublicWebsiteUrl(inputUrl);
  let response: Response | null = null;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertSafePublicWebsiteUrl(target);
    actionHistory.push(`${redirects === 0 ? "fetch" : "redirect"}:${redactWebsiteUrlForLog(target.toString())}`);
    response = await fetch(target, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "AstrailWebsiteRuntime/0.1",
      },
      signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
    });

    if (response.status < 300 || response.status > 399) break;
    const location = response.headers.get("location");
    if (!location) break;
    target = assertPublicWebsiteUrl(new URL(location, target).toString());

    if (redirects === MAX_REDIRECTS) {
      throw new Error("Website runtime stopped after too many redirects.");
    }
  }

  if (!response) throw new Error("Website runtime could not fetch this page.");
  const finalUrl = new URL(response.url || target.toString());
  await assertSafePublicWebsiteUrl(finalUrl);
  const html = await readResponseText(response);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  actionHistory.push(`fetched:${redactWebsiteUrlForLog(finalUrl.toString())}:${response.status}${contentLength > MAX_HTML_BYTES ? ":truncated" : ""}`);
  return { response, finalUrl, html };
}

function extractTitleFromHtml(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return stripTags(title ?? "") || fallback;
}

function extractLinksFromHtml(html: string, baseUrl: URL): PageControl[] {
  const links: PageControl[] = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && links.length < 8) {
    const href = htmlAttr(match[1], "href");
    const label = stripTags(match[2]).slice(0, 80);
    if (!label) continue;
    const target = sameOriginPublicUrl(href, baseUrl);
    if (!target || !href) continue;
    links.push({
      kind: "follow_link",
      label,
      selector: `a[href="${href.replace(/"/g, "\\\"")}"]`,
      href: target.toString(),
    });
  }
  return links;
}

function extractFormsFromHtml(html: string, baseUrl: URL): PageControl[] {
  const forms: PageControl[] = [];
  const pattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && forms.length < 6) {
    const index = forms.length + 1;
    const tag = match[1];
    const inner = match[2];
    const action = htmlAttr(tag, "action");
    const method = (htmlAttr(tag, "method") ?? "GET").toUpperCase();
    const target = action ? sameOriginPublicUrl(action, baseUrl) : baseUrl;
    const inputs: PageControl["inputs"] = [];
    const inputPattern = /<(input|textarea|select)\b([^>]*)>/gi;
    let inputMatch: RegExpExecArray | null;
    while ((inputMatch = inputPattern.exec(inner)) !== null && inputs.length < 12) {
      const name = htmlAttr(inputMatch[2], "name");
      if (!name) continue;
      inputs.push({
        name,
        type: htmlAttr(inputMatch[2], "type") ?? inputMatch[1].toLowerCase(),
        required: /\brequired\b/i.test(inputMatch[2]),
      });
    }
    forms.push({
      kind: "submit_form",
      label: stripTags(inner).slice(0, 80) || htmlAttr(tag, "aria-label") || `form ${index}`,
      selector: `form:nth-of-type(${index})`,
      method,
      action: target?.toString(),
      inputs,
    });
  }
  return forms;
}

function extractButtonsFromHtml(html: string): PageControl[] {
  const buttons: PageControl[] = [];
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;
  while ((match = buttonPattern.exec(html)) !== null && buttons.length < 8) {
    const label = stripTags(match[2]) || htmlAttr(match[1], "aria-label") || "button";
    if (label.length < 2) continue;
    const id = htmlAttr(match[1], "id");
    const name = htmlAttr(match[1], "name");
    buttons.push({
      kind: "click",
      label: label.slice(0, 80),
      selector: id ? `#${id}` : name ? `button[name="${name.replace(/"/g, "\\\"")}"]` : `button:nth-of-type(${buttons.length + 1})`,
    });
  }

  const inputPattern = /<input\b([^>]*(?:type\s*=\s*["']?(?:button|submit)["']?)[^>]*)>/gi;
  while ((match = inputPattern.exec(html)) !== null && buttons.length < 8) {
    const label = htmlAttr(match[1], "value") || htmlAttr(match[1], "aria-label") || "button";
    if (label.length < 2) continue;
    buttons.push({
      kind: "click",
      label: label.slice(0, 80),
      selector: `input:nth-of-type(${buttons.length + 1})`,
    });
  }

  return buttons;
}

async function analyzeWebsiteWithFetch(inputUrl: string, traceId: string, actionHistoryPrefix: string[] = []): Promise<WebsitePageAnalysis> {
  const actionHistory = [...actionHistoryPrefix];
  const { finalUrl, html } = await fetchPublicHtml(inputUrl, actionHistory);
  const title = extractTitleFromHtml(html, finalUrl.hostname);
  const visibleTextSummary = stripTags(html).slice(0, MAX_VISIBLE_TEXT_CHARS);
  const links = extractLinksFromHtml(html, finalUrl);
  const forms = extractFormsFromHtml(html, finalUrl);
  const buttons = extractButtonsFromHtml(html);
  actionHistory.push(`html_fallback:${traceId}`);

  return {
    finalUrl: finalUrl.toString(),
    title,
    visibleTextSummary,
    links: links.slice(0, MAX_CONTROLS),
    buttons: buttons.slice(0, MAX_CONTROLS),
    forms: forms.slice(0, MAX_CONTROLS),
    screenshotPath: null,
    actionHistory,
  };
}

async function executeWebsiteReadWithFetch(inputUrl: string, traceId: string, actionHistoryPrefix: string[] = []): Promise<WebsiteRuntimeExecution & { status: number | null }> {
  const actionHistory = [...actionHistoryPrefix];
  const { response, finalUrl, html } = await fetchPublicHtml(inputUrl, actionHistory);
  actionHistory.push(`html_runtime_fallback:${traceId}`);
  return {
    finalUrl: finalUrl.toString(),
    title: extractTitleFromHtml(html, finalUrl.hostname),
    visibleTextPreview: stripTags(html).slice(0, MAX_VISIBLE_TEXT_CHARS),
    screenshotPath: null,
    actionHistory,
    status: response.status,
  };
}

async function extractLinks(page: Page, baseUrl: URL): Promise<PageControl[]> {
  const links: PageControl[] = [];
  const locator = page.locator("a[href]");
  const count = Math.min(await locator.count(), 40);
  for (let index = 0; index < count && links.length < 8; index += 1) {
    const item = locator.nth(index);
    const label = await text(item);
    const href = await attr(item, "href");
    if (!label) continue;
    const target = sameOriginPublicUrl(href, baseUrl);
    if (!target || !href) continue;
    links.push({
      kind: "follow_link",
      label: label.slice(0, 80),
      selector: `a[href="${href.replace(/"/g, "\\\"")}"]`,
      href: target.toString(),
    });
  }
  return links;
}

async function extractButtons(page: Page): Promise<PageControl[]> {
  const buttons: PageControl[] = [];
  const locator = page.locator("button, input[type=button], input[type=submit]");
  const count = Math.min(await locator.count(), 16);
  for (let index = 0; index < count && buttons.length < 8; index += 1) {
    const item = locator.nth(index);
    const label = (await text(item)) || (await attr(item, "value")) || (await attr(item, "aria-label")) || "button";
    if (!label || label.length < 2) continue;
    const id = await attr(item, "id");
    const name = await attr(item, "name");
    buttons.push({
      kind: "click",
      label: label.slice(0, 80),
      selector: id ? `#${id}` : name ? `button[name="${name.replace(/"/g, "\\\"")}"]` : `button:nth-of-type(${index + 1})`,
    });
  }
  return buttons;
}

async function extractForms(page: Page, baseUrl: URL): Promise<PageControl[]> {
  const forms: PageControl[] = [];
  const locator = page.locator("form");
  const count = Math.min(await locator.count(), 8);
  for (let index = 0; index < count && forms.length < 6; index += 1) {
    const form = locator.nth(index);
    const label = (await text(form)).slice(0, 80) || (await attr(form, "aria-label")) || `form ${index + 1}`;
    const action = await attr(form, "action");
    const method = ((await attr(form, "method")) || "GET").toUpperCase();
    const target = action ? sameOriginPublicUrl(action, baseUrl) : baseUrl;
    const inputs = [];
    const fields = form.locator("input[name], textarea[name], select[name]");
    const fieldCount = Math.min(await fields.count(), 12);
    for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
      const field = fields.nth(fieldIndex);
      inputs.push({
        name: (await attr(field, "name")) || `field_${fieldIndex + 1}`,
        type: (await attr(field, "type")) || "text",
        required: (await attr(field, "required")) !== null,
      });
    }
    forms.push({
      kind: "submit_form",
      label,
      selector: `form:nth-of-type(${index + 1})`,
      method,
      action: target?.toString(),
      inputs,
    });
  }
  return forms;
}

export async function analyzeWebsiteWithPlaywright(inputUrl: string, traceId: string): Promise<WebsitePageAnalysis> {
  const target = assertPublicWebsiteUrl(inputUrl);
  const actionHistory: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser(actionHistory);
    const page = await newRuntimePage(browser, actionHistory);
    await gotoPublic(page, target, actionHistory);
    const title = await page.title();
    const visibleTextSummary = (await text(page.locator("body"))).slice(0, MAX_VISIBLE_TEXT_CHARS);
    const finalUrl = page.url();
    const finalTarget = new URL(finalUrl);
    const [links, buttons, forms] = await Promise.all([
      extractLinks(page, finalTarget),
      extractButtons(page),
      extractForms(page, finalTarget),
    ]);
    const screenshotPath = await saveScreenshot(page, traceId, "analysis");
    actionHistory.push(screenshotPath ? `screenshot:${screenshotPath}` : "screenshot:unavailable");

    return {
      finalUrl,
      title: title || finalTarget.hostname,
      visibleTextSummary,
      links: links.slice(0, MAX_CONTROLS),
      buttons: buttons.slice(0, MAX_CONTROLS),
      forms: forms.slice(0, MAX_CONTROLS),
      screenshotPath,
      actionHistory,
    };
  } catch (error) {
    actionHistory.push(`playwright_unavailable:${safeRuntimeError(error)}`);
    return analyzeWebsiteWithFetch(inputUrl, traceId, actionHistory);
  } finally {
    await browser?.close();
  }
}

export async function executeWebsiteReadWithPlaywright(
  inputUrl: string,
  traceId: string,
  actionHistoryPrefix: string[] = []
): Promise<WebsiteRuntimeExecution & { status: number | null }> {
  const target = assertPublicWebsiteUrl(inputUrl);
  const actionHistory = [...actionHistoryPrefix];
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser(actionHistory);
    const page = await newRuntimePage(browser, actionHistory);
    const status = await gotoPublic(page, target, actionHistory);
    const title = await page.title();
    const visibleTextPreview = (await text(page.locator("body"))).slice(0, MAX_VISIBLE_TEXT_CHARS);
    const screenshotPath = await saveScreenshot(page, traceId, "runtime");
    actionHistory.push(screenshotPath ? `screenshot:${screenshotPath}` : "screenshot:unavailable");
    return {
      finalUrl: page.url(),
      title,
      visibleTextPreview,
      screenshotPath,
      actionHistory,
      status,
    };
  } catch (error) {
    actionHistory.push(`playwright_unavailable:${safeRuntimeError(error)}`);
    return executeWebsiteReadWithFetch(inputUrl, traceId, actionHistory);
  } finally {
    await browser?.close();
  }
}
