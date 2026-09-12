type EnvCheck = {
  name: string;
  configured: boolean;
  required: boolean;
  status: "ready" | "missing" | "invalid";
  note?: string;
};

const edgeProviders = new Set([
  "cloudflare",
  "vercel",
  "cloudflare_vercel",
  "aws_waf",
  "other",
]);

const rateLimitModes = new Set(["in_memory", "redis", "distributed"]);

function credentialKeyStatus(): Pick<EnvCheck, "status" | "note"> {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) return { status: "missing", note: "Required for encrypted provider credential storage." };

  try {
    const key = raw.startsWith("base64:")
      ? Buffer.from(raw.slice("base64:".length), "base64")
      : Buffer.from(raw, "hex");
    if (key.length !== 32) {
      return { status: "invalid", note: "Must decode to exactly 32 bytes." };
    }
  } catch {
    return { status: "invalid", note: "Must be hex or base64: encoded bytes." };
  }

  return { status: "ready" };
}

function optionalIsoDateStatus(name: string): Pick<EnvCheck, "configured" | "status" | "note"> {
  const raw = process.env[name]?.trim();
  if (!raw) return { configured: false, status: "ready" };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { configured: true, status: "invalid", note: "Must be an ISO timestamp, for example 2026-06-13T17:30:00.000Z." };
  }

  return { configured: true, status: "ready", note: parsed.toISOString() };
}

function hasAnyEnv(names: string[]) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function requiredHttpUrlStatus(names: string[]): Pick<EnvCheck, "configured" | "status" | "note"> {
  if (!hasAnyEnv(names)) return { configured: false, status: "missing" };

  for (const name of names) {
    const raw = process.env[name]?.trim();
    if (!raw) continue;

    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return { configured: true, status: "ready", note: name };
      }
    } catch {
      return { configured: true, status: "invalid", note: `${name} must be an http(s) Redis REST URL.` };
    }

    return { configured: true, status: "invalid", note: `${name} must be an http(s) Redis REST URL.` };
  }

  return { configured: false, status: "missing" };
}

function optionalPositiveIntegerStatus(name: string): Pick<EnvCheck, "configured" | "status" | "note"> {
  const raw = process.env[name]?.trim();
  if (!raw) return { configured: false, status: "ready", note: "default" };

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return { configured: true, status: "invalid", note: "Must be a positive integer." };
  }

  return { configured: true, status: "ready", note: raw };
}

function requiredBooleanStatus(name: string, readyNote: string): Pick<EnvCheck, "configured" | "status" | "note"> {
  const raw = process.env[name]?.trim();
  if (!raw) return { configured: false, status: "missing", note: "Manual deployment attestation required." };
  if (raw !== "true") return { configured: true, status: "invalid", note: "Must be true for production readiness." };
  return { configured: true, status: "ready", note: readyNote };
}

function optionalBooleanStatus(name: string): Pick<EnvCheck, "configured" | "status" | "note"> {
  const raw = process.env[name]?.trim();
  if (!raw) return { configured: false, status: "ready", note: "default" };
  if (raw !== "true" && raw !== "false") return { configured: true, status: "invalid", note: "Must be true or false." };
  return { configured: true, status: "ready", note: raw };
}

function edgeProviderStatus(): Pick<EnvCheck, "configured" | "status" | "note"> {
  const raw = process.env.ASTRAIL_EDGE_PROVIDER?.trim();
  if (!raw) return { configured: false, status: "missing", note: "Set cloudflare, vercel, cloudflare_vercel, aws_waf, or other." };
  if (!edgeProviders.has(raw)) {
    return { configured: true, status: "invalid", note: "Allowed values: cloudflare, vercel, cloudflare_vercel, aws_waf, other." };
  }

  return { configured: true, status: "ready", note: raw };
}

function rateLimitModeStatus(): Pick<EnvCheck, "configured" | "status" | "note"> {
  const raw = process.env.RATE_LIMIT_MODE?.trim();
  if (!raw) return { configured: false, status: "missing", note: "Set in_memory for local, redis or distributed for production." };
  if (!rateLimitModes.has(raw)) {
    return { configured: true, status: "invalid", note: "Allowed values: in_memory, redis, distributed." };
  }

  return {
    configured: true,
    status: "ready",
    note: raw === "in_memory"
      ? "Local-only mode; production must also configure Redis REST envs."
      : raw,
  };
}

export function validateRuntimeEnv() {
  const credentialStatus = credentialKeyStatus();
  const billingResetStatus = optionalIsoDateStatus("ASTRAIL_BILLING_RESET_AT");
  const mcpWindowStatus = optionalPositiveIntegerStatus("ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS");
  const mcpIpLimitStatus = optionalPositiveIntegerStatus("ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX");
  const mcpGlobalIpLimitStatus = optionalPositiveIntegerStatus("ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX");
  const mcpBearerLimitStatus = optionalPositiveIntegerStatus("ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX");
  const mcpGlobalBearerLimitStatus = optionalPositiveIntegerStatus("ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX");
  const mcpMaxBodyStatus = optionalPositiveIntegerStatus("ASTRAIL_MCP_EDGE_MAX_BODY_BYTES");
  const runtimeLimitStatus = optionalPositiveIntegerStatus("ASTRAIL_RUNTIME_RATE_LIMIT_MAX");
  const runtimeWindowStatus = optionalPositiveIntegerStatus("ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS");
  const runtimeBucketsStatus = optionalPositiveIntegerStatus("ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS");
  const edgeProvider = edgeProviderStatus();
  const edgeDdos = requiredBooleanStatus("ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED", "Provider volumetric protection confirmed.");
  const edgeWaf = requiredBooleanStatus("ASTRAIL_EDGE_WAF_CONFIRMED", "Provider WAF/firewall rules confirmed.");
  const edgeBot = requiredBooleanStatus("ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED", "Provider bot/challenge controls confirmed.");
  const edgeBody = requiredBooleanStatus("ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED", "Provider request body limits confirmed.");
  const turnstileRequired = optionalBooleanStatus("CLOUDFLARE_TURNSTILE_REQUIRED");
  const hasTurnstileSiteKey = hasAnyEnv(["NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]);
  const hasTurnstileSecretKey = hasAnyEnv(["CLOUDFLARE_TURNSTILE_SECRET_KEY", "TURNSTILE_SECRET_KEY"]);
  const rateLimitMode = rateLimitModeStatus();
  const hasNeonAuthUrl = Boolean(process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? process.env.NEON_AUTH_BASE_URL);
  const hasNeonDataApiUrl = Boolean(process.env.NEXT_PUBLIC_NEON_DATA_API_URL ?? process.env.NEON_DATA_API_URL);
  const rateLimitRedisUrlStatus = requiredHttpUrlStatus(["ASTRAIL_RATE_LIMIT_REDIS_REST_URL", "UPSTASH_REDIS_REST_URL"]);
  const hasRateLimitRedisToken = hasAnyEnv(["ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
  const redisMode = process.env.RATE_LIMIT_MODE === "redis" || process.env.RATE_LIMIT_MODE === "distributed";
  const checks: EnvCheck[] = [
    {
      name: "NEXT_PUBLIC_NEON_AUTH_URL or NEON_AUTH_BASE_URL",
      configured: hasNeonAuthUrl,
      required: true,
      status: hasNeonAuthUrl ? "ready" : "missing",
    },
    {
      name: "NEXT_PUBLIC_NEON_DATA_API_URL or NEON_DATA_API_URL",
      configured: hasNeonDataApiUrl,
      required: true,
      status: hasNeonDataApiUrl ? "ready" : "missing",
    },
    {
      name: "NEON_AUTH_SERVICE_EMAIL and NEON_AUTH_SERVICE_PASSWORD",
      configured: Boolean(process.env.NEON_AUTH_SERVICE_EMAIL && process.env.NEON_AUTH_SERVICE_PASSWORD),
      required: true,
      status: process.env.NEON_AUTH_SERVICE_EMAIL && process.env.NEON_AUTH_SERVICE_PASSWORD ? "ready" : "missing",
      note: "Required for private endpoint auth, logs, bundles, and runtime admin reads.",
    },
    {
      name: "ANTHROPIC_API_KEY",
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      required: false,
      status: "ready",
      note: process.env.ANTHROPIC_API_KEY
        ? "AI-assisted generation enabled; provider failures fall back to deterministic generation."
        : "Optional; deterministic MCP generation is enabled.",
    },
    {
      name: "CREDENTIAL_ENCRYPTION_KEY",
      configured: Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY),
      required: true,
      status: credentialStatus.status,
      note: credentialStatus.note,
    },
    {
      name: "RATE_LIMIT_MODE",
      configured: rateLimitMode.configured,
      required: true,
      status: rateLimitMode.status,
      note: rateLimitMode.note,
    },
    {
      name: "ASTRAIL_RATE_LIMIT_REDIS_REST_URL or UPSTASH_REDIS_REST_URL",
      configured: rateLimitRedisUrlStatus.configured,
      required: true,
      status: rateLimitRedisUrlStatus.status,
      note: rateLimitRedisUrlStatus.note ?? "Required for distributed /api/mcp edge abuse limits.",
    },
    {
      name: "ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN or UPSTASH_REDIS_REST_TOKEN",
      configured: hasRateLimitRedisToken,
      required: true,
      status: hasRateLimitRedisToken ? "ready" : "missing",
      note: "Required for distributed /api/mcp edge abuse limits.",
    },
    {
      name: "RATE_LIMIT_MODE redis/distributed pairing",
      configured: redisMode,
      required: true,
      status: redisMode && (rateLimitRedisUrlStatus.status !== "ready" || !hasRateLimitRedisToken) ? "invalid" : "ready",
      note: redisMode
        ? "Redis REST URL and token must both be set."
        : "Redis REST envs still control whether middleware can distribute edge buckets.",
    },
    {
      name: "ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED",
      configured: Boolean(process.env.ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED),
      required: true,
      status: process.env.ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED === "true" ? "invalid" : "ready",
      note: process.env.ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED === "true"
        ? "Must not be disabled for production."
        : "enabled",
    },
    {
      name: "ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS",
      configured: mcpWindowStatus.configured,
      required: false,
      status: mcpWindowStatus.status,
      note: mcpWindowStatus.note,
    },
    {
      name: "ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX",
      configured: mcpIpLimitStatus.configured,
      required: false,
      status: mcpIpLimitStatus.status,
      note: mcpIpLimitStatus.note,
    },
    {
      name: "ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX",
      configured: mcpGlobalIpLimitStatus.configured,
      required: false,
      status: mcpGlobalIpLimitStatus.status,
      note: mcpGlobalIpLimitStatus.note,
    },
    {
      name: "ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX",
      configured: mcpBearerLimitStatus.configured,
      required: false,
      status: mcpBearerLimitStatus.status,
      note: mcpBearerLimitStatus.note,
    },
    {
      name: "ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX",
      configured: mcpGlobalBearerLimitStatus.configured,
      required: false,
      status: mcpGlobalBearerLimitStatus.status,
      note: mcpGlobalBearerLimitStatus.note,
    },
    {
      name: "ASTRAIL_MCP_EDGE_MAX_BODY_BYTES",
      configured: mcpMaxBodyStatus.configured,
      required: true,
      status: mcpMaxBodyStatus.status,
      note: `${mcpMaxBodyStatus.note}; mirror this cap in Cloudflare/Vercel WAF rules.`,
    },
    {
      name: "ASTRAIL_RUNTIME_RATE_LIMIT_MAX",
      configured: runtimeLimitStatus.configured,
      required: false,
      status: runtimeLimitStatus.status,
      note: runtimeLimitStatus.note,
    },
    {
      name: "ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS",
      configured: runtimeWindowStatus.configured,
      required: false,
      status: runtimeWindowStatus.status,
      note: runtimeWindowStatus.note,
    },
    {
      name: "ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS",
      configured: runtimeBucketsStatus.configured,
      required: false,
      status: runtimeBucketsStatus.status,
      note: runtimeBucketsStatus.note,
    },
    {
      name: "ASTRAIL_EDGE_PROVIDER",
      configured: edgeProvider.configured,
      required: true,
      status: edgeProvider.status,
      note: edgeProvider.note,
    },
    {
      name: "ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED",
      configured: edgeDdos.configured,
      required: true,
      status: edgeDdos.status,
      note: edgeDdos.note,
    },
    {
      name: "ASTRAIL_EDGE_WAF_CONFIRMED",
      configured: edgeWaf.configured,
      required: true,
      status: edgeWaf.status,
      note: edgeWaf.note,
    },
    {
      name: "ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED",
      configured: edgeBot.configured,
      required: true,
      status: edgeBot.status,
      note: edgeBot.note,
    },
    {
      name: "ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED",
      configured: edgeBody.configured,
      required: true,
      status: edgeBody.status,
      note: edgeBody.note,
    },
    {
      name: "NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY or NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      configured: hasTurnstileSiteKey,
      required: true,
      status: hasTurnstileSiteKey ? "ready" : "missing",
      note: "Required for dashboard MCP create/test challenge widgets.",
    },
    {
      name: "CLOUDFLARE_TURNSTILE_SECRET_KEY or TURNSTILE_SECRET_KEY",
      configured: hasTurnstileSecretKey,
      required: true,
      status: hasTurnstileSecretKey ? "ready" : "missing",
      note: "Required for server-side Turnstile siteverify before MCP creation/test actions.",
    },
    {
      name: "CLOUDFLARE_TURNSTILE_REQUIRED",
      configured: turnstileRequired.configured,
      required: false,
      status: turnstileRequired.status,
      note: turnstileRequired.note,
    },
    {
      name: "ASTRAIL_BILLING_RESET_AT",
      configured: billingResetStatus.configured,
      required: false,
      status: billingResetStatus.status,
      note: billingResetStatus.note ?? "unset",
    },
  ];

  const requiredReady = checks
    .filter((check) => check.required)
    .every((check) => check.status === "ready");

  return {
    status: requiredReady ? "ready" : "degraded",
    checks,
  };
}
