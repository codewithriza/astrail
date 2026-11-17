import Link from "next/link";
import { ArrowRight, Cable, CheckCircle2, ChevronRight, KeyRound, Plus, TerminalSquare } from "lucide-react";
import { WorkspaceCreateForm } from "@/components/WorkspaceCreateForm";
import { PageFrame } from "@/components/control-plane/PageFrame";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";

type WorkspaceSummary = {
  id: string;
  name: string;
  environment: string;
  status: string;
  bundle_id: string | null;
  last_activity_at: string | null;
  created_at?: string;
  integrations: number;
  tokens: number;
};

function environmentLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function WorkspacesPage() {
  let workspaces: WorkspaceSummary[] = [];
  if (hasServerNeonEnv()) {
    const user = await getDashboardSessionUser();
    const db = createUserDataClient();
    const { data } = await db.from("workspaces").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const rows = data ?? [];
    const bundleIds = rows.flatMap((workspace) => workspace.bundle_id ? [workspace.bundle_id as string] : []);
    const workspaceIds = rows.map((workspace) => workspace.id as string);
    const [memberships, tokens] = await Promise.all([
      bundleIds.length ? db.from("mcp_bundle_servers").select("bundle_id").in("bundle_id", bundleIds) : Promise.resolve({ data: [] }),
      workspaceIds.length ? db.from("api_keys").select("workspace_id").in("workspace_id", workspaceIds) : Promise.resolve({ data: [] }),
    ]);
    workspaces = rows.map((workspace) => ({
      ...workspace,
      integrations: (memberships.data ?? []).filter((item) => item.bundle_id === workspace.bundle_id).length,
      tokens: (tokens.data ?? []).filter((item) => item.workspace_id === workspace.id).length,
    })) as WorkspaceSummary[];
  }

  const readyCount = workspaces.filter((workspace) => workspace.bundle_id && workspace.tokens > 0).length;

  return (
    <PageFrame
      eyebrow="CLI gateway"
      title="Workspaces"
      description="Group the APIs an agent needs, bind credentials once, and connect through one stable CLI endpoint."
      compact
      actions={(
        <Link href="/dashboard/integrations" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-50 active:translate-y-px">
          <Plus className="h-4 w-4" /> Add integration
        </Link>
      )}
    >
      <div className="grid gap-5 xl:h-[calc(100dvh-218px)] xl:min-h-[480px] xl:grid-cols-[minmax(0,1fr)_350px] xl:overflow-hidden">
        <section aria-labelledby="workspace-list-heading" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="flex items-end justify-between gap-4 border-b border-neutral-200 px-5 py-4">
            <div>
              <h2 id="workspace-list-heading" className="text-lg font-semibold text-neutral-950">Workspace directory</h2>
              <p className="mt-1 text-sm text-neutral-500">{readyCount} ready for CLI access</p>
            </div>
            <span className="font-mono text-xs tabular-nums text-neutral-400">{String(workspaces.length).padStart(2, "0")} total</span>
          </div>

          {workspaces.length ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="hidden grid-cols-[minmax(220px,1fr)_120px_110px_110px_42px] gap-4 border-b border-neutral-200 bg-neutral-50/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 md:grid">
                <span>Workspace</span><span>Integrations</span><span>Access</span><span>Activity</span><span />
              </div>
              <div className="divide-y divide-neutral-100">
                {workspaces.map((workspace) => {
                  const ready = Boolean(workspace.bundle_id && workspace.tokens > 0);
                  return (
                    <Link key={workspace.id} href={`/dashboard/workspaces/${workspace.id}`} className="group grid gap-4 px-5 py-5 transition duration-200 hover:bg-[#fbfaf7] md:grid-cols-[minmax(220px,1fr)_120px_110px_110px_42px] md:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${ready ? "bg-orange-100 text-orange-800" : "border border-neutral-200 bg-neutral-50 text-neutral-500"}`}><TerminalSquare className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold text-neutral-950">{workspace.name}</span>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-400"}`} />
                          </span>
                          <span className="mt-1 block text-xs text-neutral-500">{environmentLabel(workspace.environment)} · {workspace.bundle_id ? "endpoint active" : "setup required"}</span>
                        </span>
                      </div>
                      <DataCell label="Integrations" value={`${workspace.integrations} connected`} />
                      <DataCell label="Access" value={workspace.tokens ? `${workspace.tokens} token${workspace.tokens === 1 ? "" : "s"}` : "No token"} attention={!workspace.tokens} />
                      <DataCell label="Activity" value={workspace.last_activity_at ? new Date(workspace.last_activity_at).toLocaleDateString() : "No calls"} />
                      <span className="grid h-9 w-9 place-items-center rounded-md text-neutral-400 transition group-hover:bg-white group-hover:text-neutral-950"><ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 items-center overflow-hidden px-6 py-8 sm:px-10">
              <div className="absolute inset-y-0 right-0 hidden w-2/5 border-l border-neutral-100 bg-[linear-gradient(#efede7_1px,transparent_1px),linear-gradient(90deg,#efede7_1px,transparent_1px)] bg-[size:22px_22px] opacity-60 md:block" />
              <div className="relative max-w-md">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-orange-100 text-orange-800"><TerminalSquare className="h-5 w-5" /></span>
                <h3 className="mt-5 text-xl font-semibold text-neutral-950">Your first CLI workspace starts here</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">Create an environment, attach the APIs it needs, then issue one scoped token. Your agent keeps the same endpoint when credentials rotate.</p>
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-neutral-500">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> One endpoint</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Scoped access</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Central rotation</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white xl:h-full">
          <div className="border-b border-orange-200 bg-[#fff6e9] px-5 py-4 text-neutral-950">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><Plus className="h-4 w-4" /></span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">New environment</span>
            </div>
            <h2 className="mt-3 text-lg font-semibold">Create a workspace</h2>
            <p className="mt-1 text-sm leading-5 text-neutral-400">Choose the boundary first. Integrations and tokens come next.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5"><WorkspaceCreateForm /></div>
          <Link href="/dashboard/connections" className="mt-auto flex items-center justify-between border-t border-neutral-200 px-5 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-950">
            <span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Manage stored credentials</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </PageFrame>
  );
}

function DataCell({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400 md:hidden">{label}</span><span className={`text-sm font-medium ${attention ? "text-amber-700" : "text-neutral-700"}`}>{value}</span></div>;
}
