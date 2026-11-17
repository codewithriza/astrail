import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const planFiles = [
  "lib/billing/plans.ts",
];
const pricingFiles = [
  "components/marketing/landing/Pricing.jsx",
];
const billingDocs = [
  "docs/billing-credits-setup.md",
];
const strategyDocs = [
  "docs/competitive-moat.md",
];
const dodoFiles = [
  "lib/billing/dodo.ts",
];
const usagePages = [
  "app/dashboard/usage/page.tsx",
];
const quotaMigrations = [
  "database/migrations/hosted-endpoint-limits.sql",
];
const schemas = [
  "database/schema.sql",
];

for (const path of planFiles) {
  const source = read(path);
  const planModule = await loadTypeScriptModule(source, path);
  const expectedPlans = [
    { id: "free", name: "Free", limit: 3 },
    { id: "starter", name: "Launch", limit: 10 },
    { id: "team", name: "Scale", limit: 100 },
  ];

  for (const expected of expectedPlans) {
    const plan = planModule.billingPlans[expected.id];
    assert.equal(plan.hostedEndpoints, expected.limit, `${path} must give ${expected.name} workspaces ${expected.limit} hosted endpoints.`);
    assert.ok(plan.features.includes(`${expected.limit} hosted MCP endpoints`), `${path} ${expected.name}-plan feature copy must match enforcement.`);
    assert.equal(planModule.hasHostedEndpointCapacity(expected.limit, expected.limit - 1), true, `${path} must allow creation of ${expected.name} endpoint #${expected.limit}.`);
    assert.equal(planModule.hasHostedEndpointCapacity(expected.limit, expected.limit), false, `${path} must reject ${expected.name} endpoint #${expected.limit + 1}.`);
  }

  assert.equal(planModule.hasHostedEndpointCapacity(null, 10_000), true, `${path} must preserve fair-use endpoint plans.`);
  assert.deepEqual(planModule.getHostedEndpointUsageSnapshot(10, 4), { remaining: 6, percentUsed: 40 }, `${path} must calculate Launch usage from the configured limit.`);
  assert.deepEqual(planModule.getHostedEndpointUsageSnapshot(3, 4), { remaining: 0, percentUsed: 100 }, `${path} must clamp over-limit Free usage after a downgrade.`);
  assert.deepEqual(planModule.getHostedEndpointUsageSnapshot(null, 10_000), { remaining: null, percentUsed: null }, `${path} must preserve fair-use usage summaries.`);
  for (const alias of ["starter", "pro", "builder", "launch"]) {
    assert.equal(planModule.normalizeBillingPlanId(alias), "starter", `${path} must map legacy Launch alias ${alias} consistently with database enforcement.`);
  }
  for (const alias of ["team", "scale"]) {
    assert.equal(planModule.normalizeBillingPlanId(alias), "team", `${path} must map Scale alias ${alias} consistently with database enforcement.`);
  }
}

for (const path of pricingFiles) {
  const source = read(path);
  assert.match(source, /'1 MCP generation \/ month', '3 hosted endpoints', '50 tool calls'/, `${path} must advertise the enforced Free plan.`);
  assert.match(source, /name: 'Launch'[\s\S]*'25 MCP generations \/ month', '10 hosted endpoints', '20,000 tool calls'/, `${path} must advertise the enforced Launch plan.`);
  assert.match(source, /name: 'Scale'[\s\S]*'150 MCP generations \/ month',[\s\S]*'100 hosted endpoints',[\s\S]*'200,000 tool calls'/, `${path} must advertise the enforced Scale plan.`);
  assert.match(source, /plan\.id === 'free' \? '\/signup' : `\/signup\?plan=\$\{plan\.id\}`/, `${path} paid CTAs must preserve the selected plan through signup.`);
  assert.doesNotMatch(source, /yearly/i, `${path} must not advertise a yearly interval that checkout does not support.`);
}

for (const path of billingDocs) {
  const source = read(path);
  assert.match(source, /\| Free \| \$0\/mo \| 500 \| 50 \| 1 \| 3 \|/, `${path} Free-plan table must document three hosted endpoints.`);
  assert.match(source, /\| Launch \| \$19\/mo \| 25,000 \| 20,000 \| 25 \| 10 \|/, `${path} Launch-plan table must document ten hosted endpoints.`);
  assert.match(source, /\| Scale \| \$99\/mo \| 250,000 \| 200,000 \| 150 \| 100 \|/, `${path} Scale-plan table must document one hundred hosted endpoints.`);
  assert.match(source, /existing endpoints keep serving/i, `${path} must document downgrade behavior without promising surprise shutdowns.`);
}

for (const path of strategyDocs) {
  const source = read(path);
  assert.match(source, /\| Free \| \$0 \| 500 \| 50\/mo \| 3 \|/, `${path} must keep Free strategy pricing current.`);
  assert.match(source, /\| Launch \| \$19\/mo \| 25,000 \| 20,000\/mo \| 10 \|/, `${path} must keep Launch strategy pricing current.`);
  assert.match(source, /\| Scale \| \$99\/mo \| 250,000 \| 200,000\/mo \| 100 \|/, `${path} must keep Scale strategy pricing current.`);
  assert.doesNotMatch(source, /\| Builder \| \$9\/mo/, `${path} must not retain the retired Builder plan.`);
}

for (const path of ["lib/billing/usage.ts"]) {
  const source = read(path);
  assert.match(source, /hasHostedEndpointCapacity\(summary\.endpointLimit, summary\.endpointsUsed\)/, `${path} must enforce the tested capacity boundary.`);
  assert.match(source, /summary\.endpointEnforcement === "active"/, `${path} must fail closed when endpoint usage cannot be counted.`);
  assert.match(source, /servers\.count \+ bundles\.count/, `${path} must count server and bundle endpoints together.`);
  assert.match(source, /hosted_endpoint_slots/, `${path} must detect whether atomic database quota claims are available.`);
  assert.match(source, /migrationPending/, `${path} must preserve count-based enforcement during a migration-first rollout.`);
  assert.match(source, /slots\.count !== endpointCount/, `${path} must fail closed when database slot claims drift from active endpoints.`);
  assert.match(source, /reconcileHostedEndpointSlots\(userId\)/, `${path} must attempt a bounded repair before failing closed on endpoint-slot drift.`);
  assert.match(source, /MAX_RECONCILED_ENDPOINTS = 500/, `${path} must bound endpoint-slot reconciliation work.`);
  assert.match(source, /return !error && count === resources\.length/, `${path} must verify the repaired ledger before allowing endpoint creation.`);
  assert.match(source, /\.not\("hosted_endpoint", "is", null\)/, `${path} must exclude failed rows without an active endpoint.`);
  assert.match(source, /reason: available \? "limit" as const : "unavailable" as const/, `${path} must distinguish unavailable metering from a reached limit.`);
  assert.match(source, /hosted_endpoint_limit_reached/, `${path} must recognize atomic database quota failures.`);
  assert.match(source, /getHostedEndpointUsageSnapshot/, `${path} must derive remaining slots and percentage from the configured plan limit.`);
  assert.match(source, /export function hostedEndpointLimitPayload/, `${path} must centralize the 402 response contract.`);
  assert.match(source, /ASTRAIL_BILLING_RESET_EMAILS/, `${path} must restrict manual usage resets to an explicit owner allowlist.`);
  assert.match(source, /BILLING_USAGE_RESET_TYPE = "admin_reset"/, `${path} must record resets without deleting billing history.`);
  assert.match(source, /getLatestBillingResetAt\(userId, basePeriod\.start\)/, `${path} must calculate monthly usage after the latest per-user reset marker.`);
}

for (const path of ["app/api/billing/status/route.ts"]) {
  const source = read(path);
  assert.match(source, /export async function POST\(request: Request\)/, `${path} must expose the owner reset action.`);
  assert.match(source, /x-astrail-reset-confirm/, `${path} must require an explicit reset confirmation header.`);
  assert.match(source, /status: 403/, `${path} must reject reset attempts from non-allowlisted accounts.`);
}

for (const path of ["app/dashboard/billing/page.tsx"]) {
  const source = read(path);
  assert.match(source, /Reset test usage/, `${path} must show the reset control only when the server authorizes it.`);
  assert.match(source, /Active hosted endpoints were kept/, `${path} must explain that reset does not bypass endpoint capacity.`);
}

for (const path of dodoFiles) {
  const source = read(path);
  assert.match(source, /hosted_endpoints: String\(plan\.hostedEndpoints \?\? "fair_use"\)/, `${path} checkout metadata must use the enforced endpoint limit.`);
  assert.match(source, /process\.env\.VERCEL_ENV === "production" \? "live_mode" : "test_mode"/, `${path} must infer live Dodo checkout mode for production Vercel deployments when the explicit environment is absent.`);
  assert.match(source, /invalidEnvironment \? "DODO_PAYMENTS_ENVIRONMENT" : null/, `${path} must reject mistyped Dodo environment values instead of silently falling back to test mode.`);
}

for (const path of [...quotaMigrations, ...schemas]) {
  const source = read(path);
  assert.match(source, /create table if not exists public\.hosted_endpoint_slots/, `${path} must define atomic endpoint slot claims.`);
  assert.match(source, /primary key \(user_id, slot\)/, `${path} must make each workspace slot exclusive.`);
  assert.match(source, /for candidate_slot in 1\.\.endpoint_limit loop/, `${path} must retry after a concurrent slot claim.`);
  assert.match(source, /on conflict do nothing/, `${path} must resolve concurrent claims without over-allocation.`);
  assert.match(source, /when active_plan in \('starter', 'pro', 'builder', 'launch'\) then 10/, `${path} must enforce ten Launch endpoints in Postgres.`);
  assert.match(source, /when active_plan in \('team', 'scale'\) then 100/, `${path} must enforce one hundred Scale endpoints in Postgres.`);
  assert.match(source, /else 3/, `${path} must enforce three Free endpoints in Postgres.`);
  assert.match(source, /where not exists \([\s\S]*existing\.resource_kind = endpoints\.resource_kind/, `${path} must repair only active endpoints that are missing a slot claim.`);
  assert.match(source, /candidate_slot := 1;[\s\S]*candidate_slot := candidate_slot \+ 1/, `${path} must backfill into the first free slot without silently dropping sparse claims.`);
  assert.match(source, /old\.user_id <> new\.user_id[\s\S]*delete from public\.hosted_endpoint_slots/, `${path} must release the previous owner slot before transferring a resource.`);
  assert.match(source, /pg_advisory_xact_lock/, `${path} must serialize concurrent claims for each workspace.`);
  assert.match(source, /select count\(\*\)[\s\S]*from public\.hosted_endpoint_slots[\s\S]*endpoint_count >= endpoint_limit/, `${path} must enforce downgraded limits by total active claims, not only low slot numbers.`);
  assert.match(source, /idx_mcp_servers_user_hosted_endpoint/, `${path} must index active server counts by workspace.`);
  assert.match(source, /idx_mcp_bundles_user_hosted_endpoint/, `${path} must index active bundle counts by workspace.`);
  assert.match(source, /create trigger enforce_mcp_server_endpoint_limit/, `${path} must guard generated and cloned servers.`);
  assert.match(source, /create trigger enforce_mcp_bundle_endpoint_limit/, `${path} must guard bundles.`);
  assert.match(source, /create trigger release_mcp_server_endpoint_slot/, `${path} must release server slots on deletion or deactivation.`);
  assert.match(source, /create trigger release_mcp_bundle_endpoint_slot/, `${path} must release bundle slots on deletion or deactivation.`);
}

for (const path of usagePages) {
  const source = read(path);
  assert.match(source, /billingPlans\.starter\.hostedEndpoints \?\? 10/, `${path} demo usage must display the Launch endpoint limit from the billing plan.`);
  assert.doesNotMatch(source, /endpointLimit:\s*5\b/, `${path} must not retain the old Launch endpoint limit.`);
}

for (const path of [
  "app/api/generate/route.ts",
  "app/api/website-to-mcp/route.ts",
  "app/api/marketplace/[id]/clone/route.ts",
  "app/api/bundles/route.ts",
]) {
  const source = read(path);
  assert.match(source, /checkHostedEndpointAllowance\((?:userData\.user\.id|userId)\)/, `${path} must enforce hosted endpoint capacity before creation.`);
  assert.match(source, /isHostedEndpointLimitError/, `${path} must translate concurrent database quota failures into a plan-limit response.`);
  assert.match(source, /hostedEndpointLimitPayload/, `${path} must return the shared 402 billing contract.`);
  assert.match(source, /endpointAllowance\.reason === "unavailable"/, `${path} must return a retryable response when metering is unavailable.`);
}

const generationRouteSource = read("app/api/generate/route.ts");
assert.match(generationRouteSource, /code:\s*"schema_migration_required"/, "Generation must return a stable schema migration error code.");
assert.doesNotMatch(generationRouteSource, /\.insert\(baseInsert\)/, "Generation must not fall back to creating an incomplete endpoint when schema columns are missing.");


for (const path of ["app/api/bundles/route.ts"]) {
  const source = read(path);
  assert.match(source, /if \(linkError\) \{[\s\S]*error: cleanupError[\s\S]*\.delete\(\)/, `${path} must remove a bundle whose links could not be saved.`);
  assert.match(source, /if \(cleanupError\)/, `${path} must surface failed cleanup instead of silently consuming a slot.`);
}

for (const path of [
  "app/api/generate/route.ts",
  "app/api/website-to-mcp/route.ts",
  "app/api/marketplace/[id]/clone/route.ts",
]) {
  assert.match(read(path), /cleanup(Error|Failed)/, `${path} must surface failed cleanup instead of silently leaving a claimed endpoint.`);
}

for (const path of ["app/api/mcp/[serverId]/route.ts"]) {
  assert.match(read(path), /typeof data\.hosted_endpoint !== "string"/, `${path} must not serve unclaimed rows without an active hosted endpoint.`);
}

for (const path of ["app/api/mcp/bundles/[bundleId]/route.ts"]) {
  const source = read(path);
  assert.match(source, /select\("id,user_id,name,is_public,hosted_endpoint"\)/, `${path} must load the bundle endpoint claim.`);
  assert.match(source, /typeof bundle\.hosted_endpoint !== "string"/, `${path} must not serve an unclaimed bundle.`);
}

console.log("PASS: Free, Launch, and Scale enforce 3, 10, and 100 hosted endpoint creation limits across runtime, UI, billing, database, and docs.");

async function loadTypeScriptModule(source, filename) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const encoded = Buffer.from(output, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${encodeURIComponent(filename)}`);
}
