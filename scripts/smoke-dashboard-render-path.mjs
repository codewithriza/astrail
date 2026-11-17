import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const allowedClientGetUser = new Set([
  "app/dashboard/settings/page.tsx",
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function dashboardPages(dir = "app/dashboard") {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const relative = `${dir}/${name}`;
    const absolute = join(root, relative);
    if (statSync(absolute).isDirectory()) return dashboardPages(relative);
    return name === "page.tsx" ? [relative] : [];
  });
}

for (const file of dashboardPages()) {
  const source = readFileSync(join(root, file), "utf8");
  if (source.includes("auth.getUser()") && !allowedClientGetUser.has(file)) {
    fail(`${file} blocks dashboard rendering with auth.getUser()`);
  }
}

const serversPage = readFileSync(join(root, "app/dashboard/servers/page.tsx"), "utf8");
if (!serversPage.includes("<Suspense fallback={<ServersListFallback />}>")) {
  fail("app/dashboard/servers/page.tsx must stream the shell before loading the server list");
}

const streamedDataRoutes = [
  ["app/dashboard/analytics/page.tsx", "<Suspense fallback={<AnalyticsFallback />}>"],
  ["app/dashboard/bundles/page.tsx", "<Suspense fallback={<BundlesFallback />}>"],
  ["app/dashboard/sdk/page.tsx", "<Suspense fallback={<SdkEndpointListFallback />}>"],
  ["app/dashboard/usage/page.tsx", "<Suspense fallback={<UsageFallback />}>"],
];

for (const [file, boundary] of streamedDataRoutes) {
  const source = readFileSync(join(root, file), "utf8");
  if (!source.includes(boundary)) {
    fail(`${file} must stream its page shell before loading dashboard data`);
  }
}

if (!process.exitCode) {
  console.log("dashboard render path smoke passed");
}
