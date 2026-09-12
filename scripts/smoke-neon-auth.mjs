#!/usr/bin/env node

const baseUrl = (process.env.ASTRAIL_AUTH_SMOKE_BASE_URL ?? "http://localhost:4187").replace(/\/$/, "");
const email = process.env.NEON_AUTH_SERVICE_EMAIL;
const password = process.env.NEON_AUTH_SERVICE_PASSWORD;
if (!email || !password) throw new Error("Neon Auth smoke credentials are not configured.");

const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ email, password, callbackURL: `${baseUrl}/dashboard` }),
  redirect: "manual",
});
const signInBody = await signIn.json().catch(() => null);
if (!signIn.ok) throw new Error(`Neon Auth sign-in failed (${signIn.status}): ${signInBody?.code ?? "unknown"}`);

const cookies = signIn.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
if (!cookies) throw new Error("Neon Auth sign-in returned no session cookie.");

const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: cookies, origin: baseUrl } });
const sessionBody = await session.json().catch(() => null);
if (!session.ok || !sessionBody?.user?.id) throw new Error(`Neon Auth session verification failed (${session.status}).`);

const dashboard = await fetch(`${baseUrl}/dashboard/onboarding`, { headers: { cookie: cookies }, redirect: "manual" });
if (dashboard.status >= 500) throw new Error(`Authenticated dashboard failed (${dashboard.status}).`);

const dashboardPages = [
  "/dashboard/integrations",
  "/dashboard/connections",
  "/dashboard/analytics",
  "/dashboard/approvals",
  "/dashboard/servers",
];
for (const path of dashboardPages) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: cookies }, redirect: "manual" });
  const body = await response.text();
  if (response.status >= 500) throw new Error(`Authenticated page ${path} failed (${response.status}).`);
  if (/Neon runtime identity (?:sign-in|token) failed/i.test(body)) {
    throw new Error(`Authenticated page ${path} leaked a runtime identity failure.`);
  }
}

const workspaces = await fetch(`${baseUrl}/api/workspaces`, { headers: { cookie: cookies } });
const workspacesBody = await workspaces.json().catch(() => null);
if (!workspaces.ok) throw new Error(`Authenticated workspaces failed (${workspaces.status}): ${workspacesBody?.error ?? "unknown"}`);

console.log(JSON.stringify({ sign_in: "ready", session: "ready", dashboard_status: dashboard.status, dashboard_pages: dashboardPages.length, workspaces: "ready" }));
