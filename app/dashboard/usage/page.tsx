import { Suspense } from "react";
import { UsageDashboard } from "@/components/UsageDashboard";
import { billingPlans } from "@/lib/billing/plans";
import { getBillingUsageSummary } from "@/lib/billing/usage";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { localDemoLogs, localDemoServers, localDemoUserId } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";

type UsageLog = {
  id: string;
  server_id: string | null;
  tool_name: string | null;
  status: string | null;
  trace_id?: string | null;
  created_at: string;
};

type ServerRow = {
  id: string;
  name: string;
  call_count: number | null;
};

export default async function UsagePage() {
  if (!hasServerNeonEnv()) {
    const usage = await getBillingUsageSummary(localDemoUserId);
    const demoLogs = localDemoLogs();
    const demoServers = localDemoServers();
    const demoEndpointLimit = billingPlans.starter.hostedEndpoints ?? 10;
    const demoGenerations = demoServers.length;
    const demoCreditsUsed = demoLogs.length + demoGenerations * usage.meterCosts.mcp_generation;
    return (
      <UsageDashboard
        usage={{
          ...usage,
          plan: "starter",
          planName: "Launch",
          status: "preview",
          creditLimit: 25_000,
          creditsUsed: demoCreditsUsed,
          creditsRemaining: 25_000 - demoCreditsUsed,
          creditsPercentUsed: Math.round((demoCreditsUsed / 25_000) * 100),
          used: demoLogs.length,
          limit: 20_000,
          remaining: 20_000 - demoLogs.length,
          percentUsed: 0,
          generationLimit: 25,
          generationsUsed: demoGenerations,
          generationRemaining: 25 - demoGenerations,
          generationPercentUsed: Math.round((demoGenerations / 25) * 100),
          endpointLimit: demoEndpointLimit,
          endpointsUsed: demoServers.length,
          endpointRemaining: demoEndpointLimit - demoServers.length,
          endpointPercentUsed: Math.round((demoServers.length / demoEndpointLimit) * 100),
        }}
        logs={demoLogs}
        servers={demoServers.map((server) => ({
          id: server.id,
          name: server.name,
          call_count: server.call_count,
        }))}
      />
    );
  }

  const user = await getDashboardSessionUser();

  return (
    <Suspense fallback={<UsageFallback />}>
      <AuthenticatedUsageDashboard userId={user.id} />
    </Suspense>
  );
}

async function AuthenticatedUsageDashboard({ userId }: { userId: string }) {
  const usage = await getBillingUsageSummary(userId);
  const { logs, servers } = await loadUsageData(userId);
  return <UsageDashboard usage={usage} logs={logs} servers={servers} />;
}

function UsageFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="border-b pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Usage</h1>
        <p className="mt-2 text-sm text-neutral-500">Astrail usage across your hosted MCP runtime workspace.</p>
        <div className="mt-7 flex flex-wrap gap-2">
          <div className="h-10 w-40 rounded-lg border border-neutral-200 bg-neutral-50" />
          <div className="h-10 w-36 rounded-lg border border-neutral-200 bg-neutral-50" />
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-4">
        {["Calls", "Errors", "Sessions", "Active"].map((label) => (
          <div key={label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">{label}</p>
            <div className="mt-3 h-8 w-16 rounded-md bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function loadUsageData(userId: string) {
  try {
    const admin = createUserDataClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: logs }, { data: servers }] = await Promise.all([
      admin
        .from("tool_call_logs")
        .select("id,server_id,tool_name,status,trace_id,created_at")
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true })
        .limit(1000),
      admin
        .from("mcp_servers")
        .select("id,name,call_count")
        .eq("user_id", userId)
        .order("call_count", { ascending: false })
        .limit(10),
    ]);

    return {
      logs: (logs ?? []) as UsageLog[],
      servers: (servers ?? []) as ServerRow[],
    };
  } catch {
    return { logs: [] as UsageLog[], servers: [] as ServerRow[] };
  }
}
