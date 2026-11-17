import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function loadRateLimiter() {
  process.env.ASTRAIL_RUNTIME_RATE_LIMIT_MAX = "2";
  process.env.ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS = "50";
  process.env.ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS = "3";

  const source = await readFile(join(appRoot, "lib/runtime/rate-limit.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", output)(module.exports, module, () => {
    throw new Error("rate-limit.ts should not import runtime dependencies");
  });
  return module.exports;
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

async function main() {
  const {
    checkRuntimeRateLimit,
    resetRuntimeRateLimitForTests,
    runtimeRateLimitStats,
  } = await loadRateLimiter();

  resetRuntimeRateLimitForTests();

  const first = checkRuntimeRateLimit("same-key");
  const second = checkRuntimeRateLimit("same-key");
  const third = checkRuntimeRateLimit("same-key");
  assert(first.allowed && second.allowed, "same-key requests inside limit should be allowed", JSON.stringify({ first, second }));
  assert(!third.allowed && third.remaining === 0, "same-key request over limit should be blocked", JSON.stringify(third));

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 70));
  const afterWindow = checkRuntimeRateLimit("same-key");
  assert(afterWindow.allowed, "same-key request after window reset should be allowed", JSON.stringify(afterWindow));

  resetRuntimeRateLimitForTests();
  checkRuntimeRateLimit("key-1");
  checkRuntimeRateLimit("key-2");
  checkRuntimeRateLimit("key-3");
  checkRuntimeRateLimit("key-4");

  const stats = runtimeRateLimitStats();
  assert(stats.bucketCount <= stats.maxBuckets, "bucket count exceeded configured cap", JSON.stringify(stats));
  assert(stats.maxBuckets === 3 && stats.defaultLimit === 2 && stats.windowMs === 50, "env-configured limiter settings were not applied", JSON.stringify(stats));

  console.log("PASS: runtime rate limiter enforces limits, resets windows, and caps buckets.");
}

main().catch((error) => fail(error instanceof Error ? error.stack ?? error.message : "unknown rate-limit smoke failure"));
