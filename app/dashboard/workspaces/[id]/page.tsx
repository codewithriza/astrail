import Link from "next/link";
import { ArrowLeft, Cable, Check, KeyRound, Plus, Terminal } from "lucide-react";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/control-plane/PageFrame";
import { WorkspaceCliConnect } from "@/components/WorkspaceCliConnect";
import { WorkspaceSetupFlow } from "@/components/WorkspaceSetupFlow";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { localDemoServers } from "@/lib/local-demo";
import { presetServers } from "@/lib/preset-servers";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import { getRuntimeBaseUrl, resolveBundleEndpoint } from "@/lib/urls";

export default async function WorkspaceDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!hasServerNeonEnv()) {
    const previewServers = localDemoServers().slice(0, 4).map((server) => ({ id: server.id, name: server.name, toolCount: server.tools_json?.length ?? 0, sourceType: server.source_type }));
    return (
      <PageFrame compact eyebrow="CLI gateway" title="Personal workspace" description="Connect this workspace with a scoped token from the API." actions={<BackLink />}>
        <WorkspaceSetupFlow workspaceId={id} workspaceName="Personal workspace" workspaceEndpoint={`${getRuntimeBaseUrl()}/api/mcp/workspaces/${id}`} servers={previewServers} initialAttachedIds={[]} hasToken={false} />
      </PageFrame>
    );
  }

  const user = await getDashboardSessionUser();
  const db = createUserDataClient();
  const { data: workspace } = await db.from("workspaces").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!workspace) notFound();
  const links = workspace.bundle_id ? (await db.from("mcp_bundle_servers").select("server_id").eq("bundle_id", workspace.bundle_id)).data ?? [] : [];
  const servers = links.length ? (await db.from("mcp_servers").select("id,name,tools_json").in("id", links.map((link) => link.server_id))).data ?? [] : [];
  const tokens = (await db.from("api_keys").select("id,name,key_preview,last_used,created_at").eq("workspace_id", id).eq("user_id", user.id).order("created_at", { ascending: false })).data ?? [];
  const availableServers = (await db.from("mcp_servers").select("id,name,tools_json,source_type").eq("user_id", user.id).order("created_at", { ascending: false })).data ?? [];
  const suggestedServers = presetServers.slice(0, 12).map((server) => ({ id: `suggested-${server.id}`, presetId: server.id, name: server.name.replace(" MCP Template", ""), toolCount: server.tools_json?.length ?? 0, sourceType: "preset" }));
  const endpoint = workspace.bundle_id ? resolveBundleEndpoint(workspace.bundle_id, null) : null;
  const workspaceEndpoint = `${getRuntimeBaseUrl()}/api/mcp/workspaces/${id}`;
  const toolCount = servers.reduce((sum, server) => sum + (Array.isArray(server.tools_json) ? server.tools_json.length : 0), 0);

  if (!endpoint || tokens.length === 0) {
    return (
      <PageFrame compact eyebrow={`${workspace.environment} environment`} title={workspace.name} description="Complete these steps once. Astrail keeps the endpoint stable when apps or credentials change." actions={<BackLink />}>
        <WorkspaceSetupFlow
          workspaceId={id}
          workspaceName={workspace.name}
          workspaceEndpoint={`${getRuntimeBaseUrl()}/api/mcp/workspaces/${id}`}
          servers={[...availableServers.map((server) => ({ id: server.id, name: server.name, toolCount: Array.isArray(server.tools_json) ? server.tools_json.length : 0, sourceType: server.source_type })), ...suggestedServers]}
          initialAttachedIds={links.map((link) => link.server_id)}
          hasToken={tokens.length > 0}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      compact
      eyebrow={`${workspace.environment} environment`}
      title={workspace.name}
      description={`${servers.length} integrations · ${toolCount} tools · ${tokens.length} scoped tokens`}
      actions={<><BackLink /><Link href="/dashboard/integrations" className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700 active:translate-y-px"><Plus className="h-4 w-4" /> Add integration</Link></>}
    >
      <div className="grid gap-5 xl:h-[calc(100dvh-218px)] xl:min-h-[480px] xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,0.75fr)] xl:overflow-hidden">
        <main className="grid min-h-0 gap-5 xl:grid-rows-[auto_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="grid md:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex items-center gap-3 border-b border-neutral-200 bg-[#f1eee7] px-5 py-4 md:border-b-0 md:border-r">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-100 text-orange-800"><Terminal className="h-4 w-4" /></span>
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Connection</p><p className="mt-1 text-sm font-semibold text-neutral-900">{endpoint ? "Ready" : "Not ready"}</p></div>
              </div>
              <div className="p-4">
                {endpoint ? <WorkspaceCliConnect endpoint={workspaceEndpoint} workspaceId={id} /> : <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-300 px-4 py-3"><p className="text-sm text-neutral-600">Attach an integration to create the endpoint.</p><Link href="/dashboard/integrations" className="shrink-0 text-sm font-semibold text-orange-700">Browse APIs</Link></div>}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div><h2 className="font-semibold text-neutral-950">Connected integrations</h2><p className="mt-1 text-xs text-neutral-500">The tool catalog exposed through this endpoint.</p></div>
              <span className="font-mono text-xs tabular-nums text-neutral-400">{String(servers.length).padStart(2, "0")}</span>
            </div>
            <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
              {servers.map((server) => <div key={server.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_100px_32px] sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-neutral-50"><Cable className="h-4 w-4 text-neutral-600" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-neutral-950">{server.name}</p><p className="mt-1 text-xs text-neutral-500">Credential binding managed centrally</p></div></div><p className="text-sm font-medium text-neutral-700">{Array.isArray(server.tools_json) ? server.tools_json.length : 0} tools</p><Check className="h-4 w-4 text-emerald-600" /></div>)}
              {!servers.length ? <div className="flex h-full min-h-48 items-center justify-center px-6 text-center"><div><Cable className="mx-auto h-6 w-6 text-neutral-300" /><p className="mt-3 text-sm font-medium text-neutral-900">No integrations attached</p><p className="mt-1 text-xs text-neutral-500">Add one API to activate this workspace endpoint.</p></div></div> : null}
            </div>
          </section>
        </main>

        <aside className="grid min-h-0 gap-5 xl:grid-rows-[auto_minmax(0,1fr)]">
          <section className="rounded-xl border border-orange-200 bg-[#fff6e9] p-5 text-neutral-950">
            <div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-700">Workspace health</p><p className="mt-2 text-lg font-semibold">{endpoint && tokens.length ? "Ready for agents" : "Setup in progress"}</p></div><span className={`mt-1 h-2 w-2 rounded-full ${endpoint && tokens.length ? "bg-emerald-500" : "bg-amber-500"}`} /></div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-orange-200 border-t border-orange-200 pt-4"><Metric value={servers.length} label="APIs" /><Metric value={toolCount} label="Tools" /><Metric value={tokens.length} label="Tokens" /></div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-50 text-orange-700"><KeyRound className="h-4 w-4" /></span><div><h2 className="font-semibold text-neutral-950">Access tokens</h2><p className="text-xs text-neutral-500">Scoped to this workspace</p></div></div></div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {tokens.map((token) => <div key={token.id} className="rounded-lg border border-neutral-200 px-3 py-3"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium text-neutral-900">{token.name}</p><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /></div><p className="mt-1 font-mono text-xs text-neutral-500">{token.key_preview}</p><p className="mt-2 text-[11px] text-neutral-400">{token.last_used ? `Used ${new Date(token.last_used).toLocaleDateString()}` : "Never used"}</p></div>)}
              {!tokens.length ? <div className="flex h-full min-h-40 items-center justify-center text-center"><div className="max-w-56"><KeyRound className="mx-auto h-5 w-5 text-neutral-300" /><p className="mt-3 text-sm font-medium text-neutral-900">No token issued</p><p className="mt-1 text-xs leading-5 text-neutral-500">Create a scoped token to connect the CLI.</p></div></div> : null}
            </div>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}

function BackLink() { return <Link href="/dashboard/workspaces" className="inline-flex h-10 items-center gap-2 text-sm font-semibold text-neutral-700 transition hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> Workspaces</Link>; }
function Metric({ value, label }: { value: number; label: string }) { return <div className="px-3 first:pl-0"><p className="font-mono text-lg tabular-nums">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</p></div>; }
