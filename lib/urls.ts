export function getPublicBaseUrl(requestUrl?: string | URL) {
  const configured = cleanUrl(process.env.NEXT_PUBLIC_APP_URL)
    ?? cleanUrl(process.env.NEXT_PUBLIC_SITE_URL);

  if (configured) return replaceRetiredRuntimeOrigin(configured);
  if (requestUrl) return new URL(requestUrl).origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

export function getRuntimeBaseUrl(requestUrl?: string | URL) {
  const configured = cleanUrl(process.env.NEXT_PUBLIC_RUNTIME_BASE_URL)
    ?? cleanUrl(process.env.ASTRAIL_RUNTIME_BASE_URL)
    ?? cleanUrl(process.env.NEXT_PUBLIC_APP_URL)
    ?? cleanUrl(process.env.NEXT_PUBLIC_SITE_URL);

  if (configured) return configured;
  if (requestUrl) return new URL(requestUrl).origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}

export function buildMcpEndpoint(serverId: string, requestUrl?: string | URL) {
  return `${getRuntimeBaseUrl(requestUrl)}/api/mcp/${serverId}`;
}

export function resolveMcpEndpoint(serverId: string, storedEndpoint?: string | null, requestUrl?: string | URL) {
  if (!storedEndpoint) return buildMcpEndpoint(serverId, requestUrl);

  try {
    const url = new URL(storedEndpoint);
    if (url.hostname === "api.astrail.dev") return buildMcpEndpoint(serverId, requestUrl);
  } catch {
    // Relative endpoints are valid for local preview fixtures.
  }

  return storedEndpoint;
}

export function buildBundleEndpoint(bundleId: string, requestUrl?: string | URL) {
  return `${getRuntimeBaseUrl(requestUrl)}/api/mcp/bundles/${bundleId}`;
}

export function resolveBundleEndpoint(bundleId: string, storedEndpoint?: string | null, requestUrl?: string | URL) {
  if (!storedEndpoint) return buildBundleEndpoint(bundleId, requestUrl);

  try {
    const url = new URL(storedEndpoint);
    if (url.hostname === "api.astrail.dev") return buildBundleEndpoint(bundleId, requestUrl);
  } catch {
    // Relative endpoints are valid for local preview fixtures.
  }

  return storedEndpoint;
}

export function getOAuthCallbackUrl(requestUrl?: string | URL) {
  const configured = cleanUrl(process.env.NEXT_PUBLIC_APP_URL)
    ?? cleanUrl(process.env.NEXT_PUBLIC_RUNTIME_BASE_URL);
  let origin: string | null = null;
  if (configured) {
    try {
      origin = new URL(configured).origin;
    } catch {
      origin = null;
    }
  }
  if (!origin && requestUrl) origin = new URL(requestUrl).origin;
  if (!origin && process.env.VERCEL_URL) origin = `https://${process.env.VERCEL_URL}`;
  origin ??= "http://localhost:3000";
  return `${origin}/api/oauth/callback`;
}

function cleanUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

function replaceRetiredRuntimeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== "api.astrail.dev") return value;
    url.hostname = "www.astrail.dev";
    return url.origin;
  } catch {
    return value;
  }
}
