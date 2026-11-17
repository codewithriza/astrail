import { coerceToOpenApiSpec, parseSpecText } from "./openapi";
import { assertSafeUpstreamUrl } from "./runtime/network-policy";
import type { SpecDiscoveryResult, SpecFormat } from "./types";

const commonSpecPaths = [
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/swagger.yaml",
  "/api-docs",
  "/api-docs.json",
  "/v1/openapi.json",
  "/v2/openapi.json",
  "/v3/openapi.json",
  "/docs/openapi.json",
  "/swagger/v1/swagger.json",
  "/swagger/index.html",
  "/docs",
  "/api/docs",
];

const candidateTerms = [
  "openapi",
  "swagger",
  "api-docs",
  "spec.json",
  "spec.yaml",
  "swagger.json",
  "openapi.json",
  "discovery",
  "discovery/v1",
];

type FetchResult = {
  url: string;
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
};

const MAX_DISCOVERY_RESPONSE_BYTES = 2_000_000;
const MAX_DISCOVERY_REDIRECTS = 5;

function inferSpecFormat(url: string, contentType: string, text: string): SpecFormat | undefined {
  const lowerUrl = url.toLowerCase();
  const lowerType = contentType.toLowerCase();
  const trimmed = text.trim();

  if (lowerType.includes("json") || lowerUrl.endsWith(".json") || trimmed.startsWith("{")) return "json";
  if (
    lowerType.includes("yaml") ||
    lowerType.includes("yml") ||
    lowerUrl.endsWith(".yaml") ||
    lowerUrl.endsWith(".yml")
  ) {
    return "yaml";
  }

  if (/^(openapi|swagger):\s*["']?\d/m.test(trimmed)) return "yaml";
  return undefined;
}

function normalizeUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value.trim(), baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function isUsefulCandidateUrl(url: string) {
  const parsed = new URL(url);
  const searchable = `${parsed.pathname}${parsed.search}`.toLowerCase();
  return candidateTerms.some((term) => searchable.includes(term)) || /\.(json|ya?ml)$/i.test(parsed.pathname);
}

function isDirectSpecFileUrl(url: URL) {
  return /\.(json|ya?ml)$/i.test(url.pathname) || url.hostname === "raw.githubusercontent.com";
}

async function readLimitedText(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_DISCOVERY_RESPONSE_BYTES) {
    throw new Error("Spec discovery response is too large.");
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_DISCOVERY_RESPONSE_BYTES) {
      throw new Error("Spec discovery response is too large.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > MAX_DISCOVERY_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Spec discovery response is too large.");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchText(url: string): Promise<FetchResult> {
  let target = new URL(url);

  for (let redirects = 0; redirects <= MAX_DISCOVERY_REDIRECTS; redirects += 1) {
    await assertSafeUpstreamUrl(target);
    const response = await fetch(target, {
      headers: {
        accept: "application/json, application/yaml, text/yaml, text/html, text/plain, */*",
        "user-agent": "AstrailSpecDiscovery/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      target = new URL(location, target);
      continue;
    }

    return {
      url: response.url || target.toString(),
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      text: await readLimitedText(response),
    };
  }

  throw new Error("Spec discovery stopped after too many redirects.");
}

function asFoundResult(inputUrl: string, result: FetchResult, method: string, diagnostics: string[]): SpecDiscoveryResult | null {
  const format = inferSpecFormat(result.url, result.contentType, result.text);
  if (!format) return null;

  try {
    const parsed = parseSpecText(result.text, format);
    coerceToOpenApiSpec(parsed);

    return {
      status: "found",
      input_url: inputUrl,
      discovered_url: result.url,
      discovery_method: method,
      content_type: result.contentType,
      spec_raw: result.text,
      spec_format: format,
      diagnostics,
    };
  } catch {
    return null;
  }
}

function isHtmlResult(result: FetchResult | null) {
  return Boolean(result?.contentType.toLowerCase().includes("html") || /<html|<!doctype html/i.test(result?.text ?? ""));
}

function extractHtmlCandidates(html: string, pageUrl: string, diagnostics: string[]) {
  const candidates: string[] = [];

  for (const match of Array.from(html.matchAll(/(?:href|src)=["']([^"']+)["']/gi))) {
    const rawUrl = match[1];
    if (!rawUrl) continue;
    if (!candidateTerms.some((term) => rawUrl.toLowerCase().includes(term))) continue;
    const resolved = normalizeUrl(rawUrl, pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  const absoluteSpecPattern = /https?:\/\/[^\s"'`,)]+(?:openapi|swagger|api-docs|spec\.json|spec\.yaml)[^\s"'`,)]*/gi;
  for (const match of Array.from(html.matchAll(absoluteSpecPattern))) {
    const resolved = normalizeUrl(match[0], pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  const stringUrlPattern = /["']([^"']*(?:openapi|swagger|api-docs|spec\.json|spec\.yaml)[^"']*)["']/gi;
  for (const match of Array.from(html.matchAll(stringUrlPattern))) {
    const rawUrl = match[1];
    if (!rawUrl || rawUrl.length > 300 || rawUrl.includes("<") || rawUrl.includes(">") || rawUrl.includes("[") || rawUrl.includes("=")) {
      continue;
    }
    if (!/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(rawUrl)) continue;
    const resolved = normalizeUrl(rawUrl, pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  diagnostics.push(`HTML links scanned: ${candidates.length} candidate spec URL(s).`);
  return unique(candidates);
}

function extractSwaggerCandidates(html: string, pageUrl: string, diagnostics: string[]) {
  const candidates: string[] = [];
  const hasSwaggerUi = /SwaggerUIBundle|SwaggerUIStandalonePreset|swagger-ui/i.test(html);

  const urlMatch = html.match(/\burl\s*:\s*["']([^"']+)["']/i);
  if (urlMatch?.[1]) {
    const resolved = normalizeUrl(urlMatch[1], pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  for (const match of Array.from(html.matchAll(/\burl\s*:\s*["']([^"']+)["']/gi))) {
    const resolved = normalizeUrl(match[1], pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  for (const match of Array.from(html.matchAll(/\burls\s*:\s*\[[\s\S]*?\]/gi))) {
    for (const url of Array.from(match[0].matchAll(/\burl\s*:\s*["']([^"']+)["']/gi))) {
      const resolved = normalizeUrl(url[1], pageUrl);
      if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
    }
  }

  diagnostics.push(`Swagger UI config detected: ${hasSwaggerUi || candidates.length > 0 ? "yes" : "no"}.`);
  return unique(candidates);
}

function extractRedocCandidates(html: string, pageUrl: string, diagnostics: string[]) {
  const candidates: string[] = [];

  for (const match of Array.from(html.matchAll(/<redoc\b[^>]*\bspec-url=["']([^"']+)["']/gi))) {
    const resolved = normalizeUrl(match[1], pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  for (const match of Array.from(html.matchAll(/Redoc\.init\(\s*["']([^"']+)["']/gi))) {
    const resolved = normalizeUrl(match[1], pageUrl);
    if (resolved && isUsefulCandidateUrl(resolved)) candidates.push(resolved);
  }

  diagnostics.push(`Redoc spec detected: ${candidates.length > 0 ? "yes" : "no"}.`);
  return unique(candidates);
}

export async function discoverOpenApiSpec(inputUrl: string): Promise<SpecDiscoveryResult> {
  const diagnostics: string[] = [`Input URL checked: ${inputUrl}.`];
  const htmlPages: FetchResult[] = [];

  let parsedInputUrl: URL;
  try {
    parsedInputUrl = new URL(inputUrl);
  } catch {
    return {
      status: "error",
      input_url: inputUrl,
      diagnostics: [...diagnostics, "Input URL is invalid."],
    };
  }

  let directResult: FetchResult | null = null;
  try {
    directResult = await fetchText(inputUrl);
    diagnostics.push(`Direct fetch result: HTTP ${directResult.status}, content-type ${directResult.contentType || "unknown"}.`);
    if (directResult.ok) {
      const found = asFoundResult(inputUrl, directResult, "direct_url", diagnostics);
      if (found) {
        diagnostics.push(`Final discovered spec URL: ${found.discovered_url}.`);
        return found;
      }
      if (isHtmlResult(directResult)) htmlPages.push(directResult);
      if (isDirectSpecFileUrl(parsedInputUrl) && htmlPages.length === 0) {
        diagnostics.push("Direct spec-like URL returned content that is not a valid OpenAPI/Swagger/Google Discovery document.");
        diagnostics.push("Common paths skipped because the input looks like a direct file URL.");
        diagnostics.push("HTML links scanned: skipped because the input did not return HTML.");
        diagnostics.push("Swagger UI config detected: no.");
        diagnostics.push("Redoc spec detected: no.");
        diagnostics.push("Final discovered spec URL: none.");
        diagnostics.push("No OpenAPI/Swagger/Google Discovery spec found automatically. Check the URL or paste raw JSON.");

        return {
          status: "not_found",
          input_url: inputUrl,
          diagnostics,
        };
      }
    } else if (isDirectSpecFileUrl(parsedInputUrl)) {
      diagnostics.push(`Direct spec-like URL returned HTTP ${directResult.status}.`);
      diagnostics.push("Common paths skipped because the input looks like a direct file URL.");
      diagnostics.push("HTML links scanned: skipped because the input did not return HTML.");
      diagnostics.push("Swagger UI config detected: no.");
      diagnostics.push("Redoc spec detected: no.");
      diagnostics.push("Final discovered spec URL: none.");
      diagnostics.push("No OpenAPI/Swagger/Google Discovery spec found automatically. Check the URL or paste raw JSON.");

      return {
        status: "not_found",
        input_url: inputUrl,
        diagnostics,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    diagnostics.push(`Direct fetch result: failed (${message}).`);
    if (isDirectSpecFileUrl(parsedInputUrl)) {
      diagnostics.push("Common paths skipped because the input looks like a direct file URL.");
      diagnostics.push("Final discovered spec URL: none.");
      diagnostics.push("No OpenAPI/Swagger/Google Discovery spec found automatically. Check the URL or paste raw JSON.");

      return {
        status: "not_found",
        input_url: inputUrl,
        diagnostics,
      };
    }
  }

  diagnostics.push(`Common paths attempted: ${commonSpecPaths.length}.`);
  for (const path of commonSpecPaths) {
    const candidateUrl = new URL(path, parsedInputUrl.origin).toString();
    try {
      const result = await fetchText(candidateUrl);
      diagnostics.push(`common_path: ${candidateUrl} returned HTTP ${result.status}.`);
      if (!result.ok) continue;

      const found = asFoundResult(inputUrl, result, "common_path", diagnostics);
      if (found) {
        diagnostics.push(`Final discovered spec URL: ${found.discovered_url}.`);
        return found;
      }

      if (isHtmlResult(result)) htmlPages.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      diagnostics.push(`common_path: ${candidateUrl} failed (${message}).`);
    }
  }

  if (htmlPages.length > 0) {
    const candidates = unique(
      htmlPages.flatMap((page) => [
        ...extractHtmlCandidates(page.text, page.url, diagnostics),
        ...extractSwaggerCandidates(page.text, page.url, diagnostics),
        ...extractRedocCandidates(page.text, page.url, diagnostics),
      ])
    );

    const queue = candidates.slice(0, 30);
    const seen = new Set(queue);

    for (let index = 0; index < queue.length && index < 60; index += 1) {
      const candidateUrl = queue[index];
      try {
        const result = await fetchText(candidateUrl);
        diagnostics.push(`html_candidate: ${candidateUrl} returned HTTP ${result.status}.`);
        if (!result.ok) continue;

        const found = asFoundResult(inputUrl, result, "html_candidate", diagnostics);
        if (found) {
          diagnostics.push(`Final discovered spec URL: ${found.discovered_url}.`);
          return found;
        }

        if (/SwaggerUIBundle|Redoc\.init|openapi|swagger|api-docs/i.test(result.text)) {
          const nestedCandidates = unique([
            ...extractHtmlCandidates(result.text, result.url, diagnostics),
            ...extractSwaggerCandidates(result.text, result.url, diagnostics),
            ...extractRedocCandidates(result.text, result.url, diagnostics),
          ]);

          for (const nestedUrl of nestedCandidates) {
            if (seen.has(nestedUrl)) continue;
            seen.add(nestedUrl);
            queue.push(nestedUrl);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        diagnostics.push(`html_candidate: ${candidateUrl} failed (${message}).`);
      }
    }
  } else {
    diagnostics.push("HTML links scanned: skipped because the input did not return HTML.");
    diagnostics.push("Swagger UI config detected: no.");
    diagnostics.push("Redoc spec detected: no.");
  }

  diagnostics.push("Final discovered spec URL: none.");
  diagnostics.push("No OpenAPI/Swagger/Google Discovery spec found automatically. Paste a direct spec URL or raw JSON.");

  return {
    status: "not_found",
    input_url: inputUrl,
    diagnostics,
  };
}
