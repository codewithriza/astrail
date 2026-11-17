import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const route = readFileSync(new URL("../app/api/billing/status/route.ts", import.meta.url), "utf8");
const usage = readFileSync(new URL("../lib/billing/usage.ts", import.meta.url), "utf8");

assert.match(route, /x-astrail-reset-confirm[^\n]+reset-monthly-usage/, "billing reset must require an explicit confirmation header");
assert.match(route, /neon\.auth\.getUser\(\)/, "billing reset must require an authenticated user");
assert.match(route, /canResetBillingUsage\(data\.user\.email\)/, "billing reset must enforce the owner email allowlist");
assert.match(usage, /const BILLING_USAGE_RESET_TYPE = "admin_reset"/, "billing reset must use an append-only marker");
assert.match(usage, /applyUserBillingReset\(basePeriod, await getLatestBillingResetAt\(userId, basePeriod\.start\)\)/, "usage counters must start after the latest user reset marker");
assert.match(usage, /getHostedEndpointUsage\(userId\)/, "hosted endpoint usage must be calculated independently of monthly reset markers");

console.log("billing reset safety smoke passed");
