import Link from "next/link";
import { ArrowRight, Cable, Plus, Terminal } from "lucide-react";
import { PageFrame, StatStrip, WarningBanner } from "@/components/control-plane/PageFrame";
import { controlPlaneStats, loadDashboardControlPlane } from "@/lib/dashboard-control-plane";

function sourceLabel(value: string | null) {
  const labels: Record<string, string> = {
    openapi_url: "OpenAPI",
    json_paste: "OpenAPI document",
    graphql_url: "GraphQL",
    graphql_sdl: "GraphQL SDL",
    mcp_url: "Remote MCP",
    website: "Website",
    preset: "Curated preset",
    workflow: "Workflow",
  };
  return labels[value ?? ""] ?? "API integration";
}

export default async function IntegrationsPage() {
  const data = await loadDashboardControlPlane();
  const stats = controlPlaneStats(data);
  const connectionsByServer = new Map<string, number>();
  data.credentials.forEach((credential) => {
    if (credential.server_id) connectionsByServer.set(credential.server_id, (connectionsByServer.get(credential.server_id) ?? 0) + 1);
  });

  return (
    <PageFrame
      eyebrow="Control plane"
      title="Integrations"
      description="Every connected API, website, GraphQL service, and upstream MCP server in one operational inventory. Open an integration to inspect its tools, credentials, runtime endpoint, and exports."
      actions={(
        <>
          <Link href="/dashboard/setup" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"><Terminal className="h-4 w-4" />Connect an agent</Link>
          <Link href="/dashboard/generate" className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white hover:bg-neutral-800"><Plus className="h-4 w-4" />Add integration</Link>
        </>
      )}
    >
      <WarningBanner warnings={data.warnings} />
      <StatStrip items={[
        { label: "Integrations", value: stats.integrations, note: `${stats.liveIntegrations} ready` },
        { label: "Exposed tools", value: stats.tools, note: "Across all integrations" },
        { label: "Secure connections", value: stats.connections, note: "Encrypted credentials" },
        { label: "Pending approvals", value: stats.pendingApprovals, note: "Human decisions required" },
      ]} />

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="font-semibold text-neutral-950">Connected systems</h2>
          <p className="mt-1 text-sm text-neutral-500">Health, source, access, and tool coverage without opening each endpoint.</p>
        </div>
        <div className="divide-y divide-neutral-100">
          {data.servers.map((server) => {
            const tools = server.tools_json?.length ?? 0;
            const connectionCount = connectionsByServer.get(server.id) ?? 0;
            const ready = server.status === "live" || server.status === "preset";
            return (
              <Link key={server.id} href={`/dashboard/servers/${server.id}`} className="group grid gap-4 px-5 py-5 hover:bg-neutral-50 md:grid-cols-[minmax(240px,1.6fr)_1fr_1fr_1fr_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-neutral-50 text-orange-700"><Cable className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-neutral-950">{server.name}</span>
                    <span className="mt-1 block truncate text-xs text-neutral-500">{server.description || server.source_url || "Managed MCP integration"}</span>
                  </span>
                </div>
                <div><p className="text-xs text-neutral-500">Source</p><p className="mt-1 text-sm font-medium text-neutral-800">{sourceLabel(server.source_type)}</p></div>
                <div><p className="text-xs text-neutral-500">Tools</p><p className="mt-1 text-sm font-medium text-neutral-800">{tools} mapped</p></div>
                <div><p className="text-xs text-neutral-500">Connections</p><p className="mt-1 text-sm font-medium text-neutral-800">{connectionCount || "None attached"}</p></div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />{server.status ?? "pending"}</span>
                  <ArrowRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
                </div>
              </Link>
            );
          })}
          {!data.servers.length ? (
            <div className="px-5 py-12 text-center"><p className="font-medium text-neutral-900">No integrations yet</p><p className="mt-1 text-sm text-neutral-500">Import a URL, spec, website, GraphQL schema, or remote MCP endpoint.</p></div>
          ) : null}
        </div>
      </section>
    </PageFrame>
  );
}
