import { spawnSync } from "node:child_process";

const baseEnv = {
  DATABASE_URL: "postgresql://role:password@example.neon.tech/database?sslmode=require",
  NEXT_PUBLIC_NEON_AUTH_URL: "https://example.neonauth.example/database/auth",
  NEXT_PUBLIC_NEON_DATA_API_URL: "https://example.apirest.example/database/rest/v1",
  NEON_AUTH_SERVICE_EMAIL: "runtime@example.com",
  NEON_AUTH_SERVICE_PASSWORD: "service-password",
  NEXT_PUBLIC_APP_URL: "https://astrail.dev",
  NEXT_PUBLIC_RUNTIME_BASE_URL: "https://astrail.dev",
  ASTRAIL_REQUIRE_AUTH: "true",
  ANTHROPIC_API_KEY: "anthropic",
  CREDENTIAL_ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
  DODO_PAYMENTS_API_KEY: "dodo",
  DODO_PRODUCT_BUILDER: "builder",
  DODO_PRODUCT_TEAM: "team",
  DODO_PAYMENTS_WEBHOOK_KEY: "webhook",
  DODO_PAYMENTS_ENVIRONMENT: "live_mode",
  RATE_LIMIT_MODE: "redis",
  ASTRAIL_RATE_LIMIT_REDIS_REST_URL: "https://redis.example.com",
  ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN: "redis-token",
  ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS: "60000",
  ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX: "300",
  ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX: "900",
  ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX: "600",
  ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX: "1800",
  ASTRAIL_MCP_EDGE_MAX_BODY_BYTES: "256000",
  ASTRAIL_RUNTIME_RATE_LIMIT_MAX: "120",
  ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS: "60000",
  ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS: "5000",
  ASTRAIL_EDGE_PROVIDER: "cloudflare_vercel",
  ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED: "true",
  ASTRAIL_EDGE_WAF_CONFIRMED: "true",
  ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED: "true",
  ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED: "true",
  NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  CLOUDFLARE_TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  CLOUDFLARE_TURNSTILE_REQUIRED: "true",
};

function runVerifyEnv(overrides = {}) {
  const env = {
    ...process.env,
    ...baseEnv,
    ...overrides,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }

  return spawnSync("npm", ["run", "verify:env", "--silent"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

function fail(message, result) {
  console.error(`FAIL: ${message}`);
  if (result?.stdout) console.error(result.stdout);
  if (result?.stderr) console.error(result.stderr);
  process.exit(1);
}

function assertPass(label, overrides) {
  const result = runVerifyEnv(overrides);
  if (result.status !== 0 || !result.stdout.includes("env_status ready")) {
    fail(`${label} should pass verify:env`, result);
  }
  console.log(`${label}: ready`);
}

function assertFail(label, overrides, expectedLine) {
  const result = runVerifyEnv(overrides);
  if (result.status === 0 || !result.stdout.includes("env_status degraded")) {
    fail(`${label} should fail verify:env`, result);
  }
  if (expectedLine && !result.stdout.includes(expectedLine)) {
    fail(`${label} did not print expected failure: ${expectedLine}`, result);
  }
  console.log(`${label}: rejected`);
}

assertPass("production-env-readiness");
assertPass("production-without-optional-anthropic", {
  ANTHROPIC_API_KEY: undefined,
});
assertPass("upstash-alias-readiness", {
  ASTRAIL_RATE_LIMIT_REDIS_REST_URL: "",
  ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN: "",
  UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token",
});
assertFail("redis-mode-missing-token", {
  ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN: undefined,
}, "invalid RATE_LIMIT_MODE redis/distributed pairing required");
assertFail("redis-mode-invalid-url", {
  ASTRAIL_RATE_LIMIT_REDIS_REST_URL: "redis.example.com",
}, "invalid ASTRAIL_RATE_LIMIT_REDIS_REST_URL or UPSTASH_REDIS_REST_URL required");
assertFail("edge-rate-limit-disabled", {
  ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED: "true",
}, "invalid ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED required");
assertFail("missing-waf-attestation", {
  ASTRAIL_EDGE_WAF_CONFIRMED: "false",
}, "invalid ASTRAIL_EDGE_WAF_CONFIRMED required");
assertFail("missing-turnstile-secret", {
  CLOUDFLARE_TURNSTILE_SECRET_KEY: undefined,
}, "missing CLOUDFLARE_TURNSTILE_SECRET_KEY or TURNSTILE_SECRET_KEY required");
assertFail("invalid-body-size-limit", {
  ASTRAIL_MCP_EDGE_MAX_BODY_BYTES: "0",
}, "invalid ASTRAIL_MCP_EDGE_MAX_BODY_BYTES required");

console.log("PASS: production env readiness smoke checks passed.");
