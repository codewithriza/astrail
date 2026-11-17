import { NextResponse, type NextRequest } from "next/server";
import { getNeonAuth } from "@/lib/neon/server";
import { browserMutationAllowed, normalizeOrigin, requestOrigin } from "@/lib/origin-policy";
import { auditMcpSecurityEvent } from "@/lib/runtime/observability";
import { configuredCorsOrigins } from "@/lib/cors-origins";

type EdgeBucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

function auditErrorData(event: ReturnType<typeof auditMcpSecurityEvent>, status: number, reason: string) {
  return {
    reason,
    status,
    trace_id: event.trace_id,
  };
}

const mcpEdgeBuckets = new Map<string, EdgeBucket>();

function shouldRequireAuth() {
  if (process.env.ASTRAIL_REQUIRE_AUTH === "false") return false;
  if (process.env.ASTRAIL_REQUIRE_AUTH === "true") return true;
  return process.env.NODE_ENV === "production";
}

function numericEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function rejectOversizedMcpRequest(request: NextRequest, maxBytes: number) {
  if (request.method !== "POST") return null;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength <= maxBytes) return null;

  const reason = "payload_too_large";
  const audit = auditMcpSecurityEvent({
    route: "mcp_edge",
    path: request.nextUrl.pathname,
    reason,
    status: 413,
    content_length: request.headers.get("content-length"),
  });

  return withSecurityHeaders(NextResponse.json({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32013,
      message: "MCP JSON-RPC payload is too large.",
      data: auditErrorData(audit, 413, reason),
    },
  }, {
    status: 413,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  }));
}

function clientIp(request: NextRequest) {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0]?.trim() || "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || "unknown";
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function checkEdgeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = mcpEdgeBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    mcpEdgeBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function upstashConfig() {
  const url = firstNonEmptyEnv([
    "ASTRAIL_RATE_LIMIT_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_URL",
  ]);
  const token = firstNonEmptyEnv([
    "ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN",
    "UPSTASH_REDIS_REST_TOKEN",
  ]);

  if (!url || !token) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    token,
  };
}

async function checkDistributedRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision | null> {
  const config = upstashConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.url}/multi-exec`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, windowMs],
      ]),
      cache: "no-store",
    });

    if (!response.ok) return null;
    const payload = await response.json();
    if (!Array.isArray(payload) || payload[0]?.error) return null;

    const count = Number(payload[0]?.result);
    if (!Number.isFinite(count)) return null;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: Date.now() + windowMs,
    };
  } catch {
    return null;
  }
}

async function checkHybridRateLimit(key: string, limit: number, windowMs: number) {
  return (await checkDistributedRateLimit(key, limit, windowMs))
    ?? checkEdgeRateLimit(key, limit, windowMs);
}

function rateLimitedResponse(request: NextRequest, resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  const reason = "edge_rate_limited";
  const audit = auditMcpSecurityEvent({
    route: "mcp_edge",
    path: request.nextUrl.pathname,
    reason,
    status: 429,
    retry_after_seconds: retryAfter,
  });
  const headers = {
    "Retry-After": String(retryAfter),
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };

  if (request.method === "POST") {
    return withSecurityHeaders(NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32029,
        message: "MCP endpoint rate limit exceeded.",
        data: auditErrorData(audit, 429, reason),
      },
    }, { status: 429, headers }));
  }

  return withSecurityHeaders(NextResponse.json({
    error: "MCP endpoint rate limit exceeded.",
    retry_after_seconds: retryAfter,
    trace_id: audit.trace_id,
  }, { status: 429, headers }));
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

function apiBrowserMutationRejection(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;
  if (request.nextUrl.pathname.startsWith("/api/mcp/")) return null;

  const decision = browserMutationAllowed(request.method, request.headers, request.url);
  if (decision.allowed) return null;

  return withSecurityHeaders(NextResponse.json({
    ok: false,
    error: "Request origin is not allowed.",
    code: decision.reason,
  }, {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "Vary": "Origin, Sec-Fetch-Site",
    },
  }));
}

function mcpOriginRejection(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/mcp/")) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null;

  const normalizedOrigin = normalizeOrigin(origin);
  const sameOrigin = requestOrigin(request.headers, request.url);
  if (normalizedOrigin && sameOrigin && normalizedOrigin === sameOrigin) return null;

  const configured = configuredCorsOrigins();
  const allowed = configured.filter((value) => value !== "*");
  const auth = request.headers.get("authorization");
  const strictOriginRequired = process.env.NODE_ENV === "production"
    || process.env.ASTRAIL_MCP_STRICT_ORIGIN === "true"
    || Boolean(auth);

  if (allowed.includes(origin)) return null;
  if (!strictOriginRequired && allowed.length === 0) return null;

  const reason = "origin_not_allowed";
  const audit = auditMcpSecurityEvent({
    route: "mcp_edge",
    path: request.nextUrl.pathname,
    reason,
    status: 403,
  });

  return withSecurityHeaders(NextResponse.json({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32003,
      message: allowed.length === 0
        ? "MCP CORS origin allowlist is not configured."
        : "MCP CORS origin is not allowed.",
      data: auditErrorData(audit, 403, reason),
    },
  }, {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "Vary": "Origin",
    },
  }));
}

async function checkMcpEdgeAbuseGuard(request: NextRequest) {
  if (process.env.ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED === "true") return null;
  if (!request.nextUrl.pathname.startsWith("/api/mcp/")) return null;

  const windowMs = numericEnv("ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS", 60_000);
  const ipLimit = numericEnv("ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX", 300);
  const globalIpLimit = numericEnv("ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX", Math.max(ipLimit * 3, ipLimit));
  const bearerLimit = numericEnv("ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX", 600);
  const globalBearerLimit = numericEnv("ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX", Math.max(bearerLimit * 3, bearerLimit));
  const maxBodyBytes = numericEnv("ASTRAIL_MCP_EDGE_MAX_BODY_BYTES", 256_000);
  const oversized = rejectOversizedMcpRequest(request, maxBodyBytes);
  if (oversized) return oversized;

  const routeKey = `${request.method}:${request.nextUrl.pathname.replace(/\/+$/, "")}`;
  const routeHash = await digest(routeKey);
  const ipHash = await digest(clientIp(request));
  const globalIpBucket = await checkHybridRateLimit(`mcp:ip:${ipHash}:all`, globalIpLimit, windowMs);
  if (!globalIpBucket.allowed) return rateLimitedResponse(request, globalIpBucket.resetAt);

  const ipBucket = await checkHybridRateLimit(`mcp:ip:${ipHash}:${routeHash}`, ipLimit, windowMs);
  if (!ipBucket.allowed) return rateLimitedResponse(request, ipBucket.resetAt);

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const bearerHash = await digest(auth.slice("Bearer ".length));
    const globalBearerBucket = await checkHybridRateLimit(`mcp:bearer:${bearerHash}:all`, globalBearerLimit, windowMs);
    if (!globalBearerBucket.allowed) return rateLimitedResponse(request, globalBearerBucket.resetAt);

    const bearerBucket = await checkHybridRateLimit(`mcp:bearer:${bearerHash}:${routeHash}`, bearerLimit, windowMs);
    if (!bearerBucket.allowed) return rateLimitedResponse(request, bearerBucket.resetAt);
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const originRejection = mcpOriginRejection(request);
  if (originRejection) return originRejection;

  const mcpGuard = await checkMcpEdgeAbuseGuard(request);
  if (mcpGuard) return mcpGuard;

  const apiOriginRejection = apiBrowserMutationRejection(request);
  if (apiOriginRejection) return apiOriginRejection;

  let response = NextResponse.next({ request });
  const host = request.headers.get("host") ?? "";

  if (host.split(":")[0] === "status.astrail.dev" && request.nextUrl.pathname === "/") {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/status";
    return withSecurityHeaders(NextResponse.rewrite(rewriteUrl));
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withSecurityHeaders(response);
  }

  const dashboardRequest = request.nextUrl.pathname.startsWith("/dashboard");
  const authCompletionRequest = request.nextUrl.pathname === "/auth/complete"
    && request.nextUrl.searchParams.has("neon_auth_session_verifier");
  if (!dashboardRequest && !authCompletionRequest) {
    return withSecurityHeaders(response);
  }

  const authUrl = process.env.NEON_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_NEON_AUTH_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!authUrl || !cookieSecret) {
    if (dashboardRequest && shouldRequireAuth()) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      redirectUrl.searchParams.set("error", "Production sign-in is not configured yet. Finish workspace auth setup before opening the dashboard.");
      return withSecurityHeaders(NextResponse.redirect(redirectUrl));
    }

    return withSecurityHeaders(response);
  }

  if (!shouldRequireAuth() && !authCompletionRequest) {
    return withSecurityHeaders(response);
  }

  try {
    const authResponse = await getNeonAuth().middleware({ loginUrl: "/login" })(request);
    return withSecurityHeaders(authResponse);
  } catch {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return withSecurityHeaders(NextResponse.redirect(redirectUrl));
  }
}

export const config = {
  matcher: ["/", "/auth/complete", "/dashboard/:path*", "/api/:path*"],
};
