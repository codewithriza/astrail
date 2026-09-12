const { existsSync: envExistsSync, readFileSync: envReadFileSync } = require("node:fs");
const { resolve: envResolve } = require("node:path");

type EnvStatus = "ready" | "missing" | "invalid";
type EnvCheck = {
  name: string;
  required: boolean;
  status: EnvStatus;
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

function loadEnvVerifierFile() {
  const path = envResolve(process.cwd(), ".env.local");
  if (!envExistsSync(path)) return;
  const lines = envReadFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ||= value;
  }
}

function credentialEnvKeyStatus(): { status: EnvStatus; note?: string } {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) return { status: "missing", note: "Required for encrypted provider credential storage." };
  try {
    const key = raw.startsWith("base64:")
      ? Buffer.from(raw.slice("base64:".length), "base64")
      : Buffer.from(raw, "hex");
    if (key.length !== 32) return { status: "invalid", note: "Must decode to exactly 32 bytes." };
  } catch {
    return { status: "invalid", note: "Must be hex or base64: encoded bytes." };
  }
  return { status: "ready" };
}

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function requiredHttpUrlEnvStatus(keys: string[]): EnvStatus {
  if (!hasAnyEnv(keys)) return "missing";

  for (const key of keys) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;

    try {
      const url = new URL(raw);
      return url.protocol === "https:" || url.protocol === "http:" ? "ready" : "invalid";
    } catch {
      return "invalid";
    }
  }

  return "missing";
}

function optionalIsoDateEnvStatus(name: string): EnvStatus {
  const raw = process.env[name]?.trim();
  if (!raw) return "ready";
  return Number.isNaN(new Date(raw).getTime()) ? "invalid" : "ready";
}

function optionalPositiveIntegerEnvStatus(name: string): EnvStatus {
  const raw = process.env[name]?.trim();
  if (!raw) return "ready";
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? "ready" : "invalid";
}

function requiredBooleanEnvStatus(name: string): EnvStatus {
  const raw = process.env[name]?.trim();
  if (!raw) return "missing";
  return raw === "true" ? "ready" : "invalid";
}

function optionalBooleanEnvStatus(name: string): EnvStatus {
  const raw = process.env[name]?.trim();
  if (!raw) return "ready";
  return raw === "true" || raw === "false" ? "ready" : "invalid";
}

function edgeProviderEnvStatus(): EnvStatus {
  const raw = process.env.ASTRAIL_EDGE_PROVIDER?.trim();
  if (!raw) return "missing";
  return edgeProviders.has(raw) ? "ready" : "invalid";
}

function rateLimitModeEnvStatus(): EnvStatus {
  const raw = process.env.RATE_LIMIT_MODE?.trim();
  if (!raw) return "missing";
  return rateLimitModes.has(raw) ? "ready" : "invalid";
}

loadEnvVerifierFile();

const envCredential = credentialEnvKeyStatus();
const billingEnvironment = process.env.DODO_PAYMENTS_ENVIRONMENT;
const rateLimitMode = process.env.RATE_LIMIT_MODE?.trim();
const rateLimitRedisUrlStatus = requiredHttpUrlEnvStatus(["ASTRAIL_RATE_LIMIT_REDIS_REST_URL", "UPSTASH_REDIS_REST_URL"]);
const hasRateLimitRedisToken = hasAnyEnv(["ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
const checks: EnvCheck[] = [
  { name: "DATABASE_URL", required: true, status: process.env.DATABASE_URL ? "ready" : "missing" },
  { name: "NEXT_PUBLIC_NEON_AUTH_URL", required: true, status: process.env.NEXT_PUBLIC_NEON_AUTH_URL ? "ready" : "missing" },
  { name: "NEXT_PUBLIC_NEON_DATA_API_URL", required: true, status: process.env.NEXT_PUBLIC_NEON_DATA_API_URL ? "ready" : "missing" },
  { name: "NEON_AUTH_SERVICE_EMAIL", required: true, status: process.env.NEON_AUTH_SERVICE_EMAIL ? "ready" : "missing" },
  { name: "NEON_AUTH_SERVICE_PASSWORD", required: true, status: process.env.NEON_AUTH_SERVICE_PASSWORD ? "ready" : "missing" },
  { name: "NEXT_PUBLIC_APP_URL", required: true, status: process.env.NEXT_PUBLIC_APP_URL ? "ready" : "missing" },
  { name: "NEXT_PUBLIC_RUNTIME_BASE_URL", required: true, status: process.env.NEXT_PUBLIC_RUNTIME_BASE_URL ? "ready" : "missing" },
  { name: "ASTRAIL_REQUIRE_AUTH", required: true, status: process.env.ASTRAIL_REQUIRE_AUTH === "true" ? "ready" : "invalid" },
  {
    name: "ANTHROPIC_API_KEY",
    required: false,
    status: "ready",
    note: process.env.ANTHROPIC_API_KEY
      ? "AI-assisted generation enabled; provider failures fall back to deterministic generation."
      : "Optional; deterministic MCP generation is enabled.",
  },
  { name: "CREDENTIAL_ENCRYPTION_KEY", required: true, status: envCredential.status, note: envCredential.note },
  { name: "DODO_PAYMENTS_API_KEY", required: true, status: process.env.DODO_PAYMENTS_API_KEY || process.env.DODO_API_KEY ? "ready" : "missing" },
  { name: "DODO_PRODUCT_LAUNCH", required: true, status: hasAnyEnv(["DODO_PRODUCT_LAUNCH", "DODO_PRODUCT_BUILDER", "DODO_PRODUCT_STARTER", "DODO_PRODUCT_PRO", "DODO_PAYMENTS_PRODUCT_LAUNCH", "DODO_PAYMENTS_PRODUCT_BUILDER", "DODO_PAYMENTS_PRODUCT_STARTER", "DODO_PAYMENTS_PRODUCT_PRO"]) ? "ready" : "missing" },
  { name: "DODO_PRODUCT_SCALE", required: true, status: hasAnyEnv(["DODO_PRODUCT_SCALE", "DODO_PRODUCT_TEAM", "DODO_PAYMENTS_PRODUCT_SCALE", "DODO_PAYMENTS_PRODUCT_TEAM"]) ? "ready" : "missing" },
  { name: "DODO_PAYMENTS_WEBHOOK_KEY", required: true, status: hasAnyEnv(["DODO_PAYMENTS_WEBHOOK_KEY", "DODO_WEBHOOK_SECRET", "DODO_PAYMENTS_WEBHOOK_SECRET"]) ? "ready" : "missing" },
  { name: "DODO_PAYMENTS_ENVIRONMENT", required: true, status: billingEnvironment === "test_mode" || billingEnvironment === "live_mode" ? "ready" : "invalid" },
  { name: "RATE_LIMIT_MODE", required: true, status: rateLimitModeEnvStatus(), note: "Use redis or distributed in production once Redis REST envs are set." },
  { name: "ASTRAIL_RATE_LIMIT_REDIS_REST_URL or UPSTASH_REDIS_REST_URL", required: true, status: rateLimitRedisUrlStatus, note: "Required for distributed /api/mcp/* abuse buckets." },
  { name: "ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN or UPSTASH_REDIS_REST_TOKEN", required: true, status: hasRateLimitRedisToken ? "ready" : "missing", note: "Required for distributed /api/mcp/* abuse buckets." },
  { name: "RATE_LIMIT_MODE redis/distributed pairing", required: true, status: rateLimitMode === "redis" || rateLimitMode === "distributed" ? rateLimitRedisUrlStatus === "ready" && hasRateLimitRedisToken ? "ready" : "invalid" : "ready" },
  { name: "ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED", required: true, status: process.env.ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED === "true" ? "invalid" : "ready", note: "Must stay unset or false in production." },
  { name: "ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS") },
  { name: "ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX") },
  { name: "ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX") },
  { name: "ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX") },
  { name: "ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX") },
  { name: "ASTRAIL_MCP_EDGE_MAX_BODY_BYTES", required: true, status: optionalPositiveIntegerEnvStatus("ASTRAIL_MCP_EDGE_MAX_BODY_BYTES"), note: "Mirror this body cap in Cloudflare/Vercel WAF rules." },
  { name: "ASTRAIL_RUNTIME_RATE_LIMIT_MAX", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_RUNTIME_RATE_LIMIT_MAX") },
  { name: "ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS") },
  { name: "ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS", required: false, status: optionalPositiveIntegerEnvStatus("ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS") },
  { name: "ASTRAIL_EDGE_PROVIDER", required: true, status: edgeProviderEnvStatus(), note: "cloudflare, vercel, cloudflare_vercel, aws_waf, or other." },
  { name: "ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED", required: true, status: requiredBooleanEnvStatus("ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED"), note: "Manual attestation that provider volumetric protection is enabled." },
  { name: "ASTRAIL_EDGE_WAF_CONFIRMED", required: true, status: requiredBooleanEnvStatus("ASTRAIL_EDGE_WAF_CONFIRMED"), note: "Manual attestation that provider WAF/firewall rules cover public routes." },
  { name: "ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED", required: true, status: requiredBooleanEnvStatus("ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED"), note: "Manual attestation that bot/challenge rules cover public routes." },
  { name: "ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED", required: true, status: requiredBooleanEnvStatus("ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED"), note: "Manual attestation that edge body-size limits mirror app limits." },
  { name: "NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY or NEXT_PUBLIC_TURNSTILE_SITE_KEY", required: true, status: hasAnyEnv(["NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) ? "ready" : "missing", note: "Required for dashboard MCP create/test challenge widgets." },
  { name: "CLOUDFLARE_TURNSTILE_SECRET_KEY or TURNSTILE_SECRET_KEY", required: true, status: hasAnyEnv(["CLOUDFLARE_TURNSTILE_SECRET_KEY", "TURNSTILE_SECRET_KEY"]) ? "ready" : "missing", note: "Required for server-side Turnstile siteverify before MCP creation/test actions." },
  { name: "CLOUDFLARE_TURNSTILE_REQUIRED", required: false, status: optionalBooleanEnvStatus("CLOUDFLARE_TURNSTILE_REQUIRED") },
  { name: "ASTRAIL_BILLING_RESET_AT", required: false, status: optionalIsoDateEnvStatus("ASTRAIL_BILLING_RESET_AT") },
];

let ready = true;
for (const { name, required, status, note } of checks) {
  console.log(`${status} ${name}${required ? " required" : " optional"}${note ? ` - ${note}` : ""}`);
  if (required && status !== "ready") ready = false;
}

if (!ready) {
  console.log("env_status degraded");
  process.exit(1);
}

console.log("env_status ready");
