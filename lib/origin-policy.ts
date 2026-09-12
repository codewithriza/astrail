type OriginEnv = {
  ASTRAIL_CORS_ORIGINS?: string;
  ALLOWED_ORIGIN?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_RUNTIME_BASE_URL?: string;
  VERCEL_URL?: string;
  NODE_ENV?: string;
};

type BrowserMutationDecision = {
  allowed: boolean;
  reason?: "invalid_origin" | "origin_not_allowed" | "cross_site_fetch";
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

function splitConfiguredOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function addAstrailCanonicalPair(origins: Set<string>, origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === "astrail.dev") {
      url.hostname = "www.astrail.dev";
      origins.add(url.origin);
    } else if (url.hostname === "www.astrail.dev") {
      url.hostname = "astrail.dev";
      origins.add(url.origin);
    }
  } catch {
    // Invalid entries are filtered before this helper is called.
  }
}

export function configuredBrowserOrigins(env: OriginEnv = process.env) {
  const configured = [
    env.ASTRAIL_CORS_ORIGINS,
    env.ALLOWED_ORIGIN,
    env.NEXT_PUBLIC_SITE_URL,
    env.NEXT_PUBLIC_APP_URL,
    env.NEXT_PUBLIC_RUNTIME_BASE_URL,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "",
  ].flatMap(splitConfiguredOrigins);

  if (env.NODE_ENV !== "production") {
    configured.push("http://localhost:3000", "http://localhost:3001");
  }

  const origins = new Set(
    configured
      .filter((value) => value !== "*")
      .map(normalizeOrigin)
      .filter((value): value is string => Boolean(value)),
  );

  for (const origin of Array.from(origins)) addAstrailCanonicalPair(origins, origin);
  return origins;
}

export function requestOrigin(headers: Headers, requestUrl: string) {
  const host = headers.get("host");
  if (host) {
    const protocol = headers.get("x-forwarded-proto")
      || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return normalizeOrigin(`${protocol}://${host}`);
  }

  return normalizeOrigin(requestUrl);
}

export function isRequestOriginAllowed(request: Request, env: OriginEnv = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const sameOrigin = requestOrigin(request.headers, request.url);
  if (sameOrigin && normalizedOrigin === sameOrigin) return true;

  const allowedOrigins = configuredBrowserOrigins(env);
  if (allowedOrigins.size === 0) return env.NODE_ENV !== "production";

  return allowedOrigins.has(normalizedOrigin);
}

export function browserMutationAllowed(
  method: string,
  headers: Headers,
  requestUrl: string,
  env: OriginEnv = process.env,
): BrowserMutationDecision {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return { allowed: true };

  const origin = headers.get("origin");
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) return { allowed: false, reason: "invalid_origin" };

    const sameOrigin = requestOrigin(headers, requestUrl);
    if (sameOrigin && normalizedOrigin === sameOrigin) return { allowed: true };

    if (configuredBrowserOrigins(env).has(normalizedOrigin)) return { allowed: true };
    return { allowed: false, reason: "origin_not_allowed" };
  }

  if (headers.get("sec-fetch-site") === "cross-site") {
    return { allowed: false, reason: "cross_site_fetch" };
  }

  return { allowed: true };
}
