"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Cable, Check, CheckCircle2, ChevronRight, KeyRound, Loader2, LockKeyhole, Terminal, TestTube2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CopyCommand } from "@/components/control-plane/CopyCommand";
import { Button } from "@/components/ui/button";

type ServerOption = { id: string; name: string; toolCount: number; sourceType?: string | null; presetId?: string; icon?: string };
type Step = "apps" | "access" | "connect" | "test";

const steps: Array<{ id: Step; label: string; helper: string; icon: typeof Cable }> = [
  { id: "apps", label: "Connect apps", helper: "Choose what this workspace can use", icon: Cable },
  { id: "access", label: "Secure access", helper: "Issue a revocable CLI token", icon: LockKeyhole },
  { id: "connect", label: "Connect the CLI", helper: "Run one setup command", icon: Terminal },
  { id: "test", label: "Test the connection", helper: "Confirm Astrail can see the tools", icon: TestTube2 },
];

export function WorkspaceSetupFlow({ workspaceId, workspaceName, workspaceEndpoint, servers, initialAttachedIds, hasToken }: { workspaceId: string; workspaceName: string; workspaceEndpoint: string; servers: ServerOption[]; initialAttachedIds: string[]; hasToken: boolean }) {
  const router = useRouter();
  const [attachedIds, setAttachedIds] = useState(initialAttachedIds);
  const [selectedId, setSelectedId] = useState(servers.find((server) => !initialAttachedIds.includes(server.id))?.id ?? "");
  const [permission, setPermission] = useState<"read_only" | "execute">("execute");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(initialAttachedIds.length === 0 ? "apps" : hasToken ? "connect" : "access");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  const endpoint = workspaceEndpoint;
  const selectedServer = servers.find((server) => server.id === selectedId);
  const completed = useMemo(() => ({ apps: attachedIds.length > 0, access: hasToken || Boolean(rawKey), connect: tested || step === "test", test: tested }), [attachedIds.length, hasToken, rawKey, step, tested]);

  async function attachIntegration() {
    if (!selectedId) return;
    setBusy(true); setError(null);
    try {
      let serverId = selectedId;
      if (selectedServer?.presetId) {
        const cloneResponse = await fetch(`/api/marketplace/${selectedServer.presetId}/clone`, { method: "POST" });
        const cloneBody = await cloneResponse.json() as { id?: string; error?: string };
        if (!cloneResponse.ok || !cloneBody.id) throw new Error(cloneBody.error ?? "Could not add this app.");
        serverId = cloneBody.id;
      }
      const response = await fetch(`/api/workspaces/${workspaceId}/integrations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ server_id: serverId }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not connect this app.");
      setAttachedIds((current) => [...new Set([...current, serverId])]);
      setStep(hasToken ? "connect" : "access");
      router.refresh();
    } catch (attachError) { setError(attachError instanceof Error ? attachError.message : "Could not connect this app."); }
    finally { setBusy(false); }
  }

  async function createToken() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `${workspaceName} CLI`, permission }) });
      const body = await response.json() as { error?: string; rawKey?: string };
      if (!response.ok || !body.rawKey) throw new Error(body.error ?? "Could not create the access token.");
      setRawKey(body.rawKey); setStep("connect");
    } catch (tokenError) { setError(tokenError instanceof Error ? tokenError.message : "Could not create the access token."); }
    finally { setBusy(false); }
  }

  const currentIndex = steps.findIndex((item) => item.id === step);

  function completeTest() {
    setTested(true);
    window.setTimeout(() => router.refresh(), 700);
  }

  return (
    <div className="grid overflow-hidden rounded-xl border border-neutral-200 bg-white xl:h-[calc(100dvh-218px)] xl:min-h-[500px] xl:grid-cols-[270px_minmax(0,1fr)]">
      <nav aria-label="Workspace setup" className="border-b border-orange-200 bg-[#f3e9da] p-4 text-neutral-950 xl:border-b-0 xl:border-r xl:p-5">
        <div className="mb-5 hidden xl:block"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700">Workspace setup</p><h2 className="mt-2 text-lg font-semibold">Four steps to ready</h2><p className="mt-1 text-xs leading-5 text-neutral-600">Astrail handles the endpoint and credentials behind the scenes.</p></div>
        <ol className="grid grid-cols-4 gap-1 xl:grid-cols-1 xl:gap-2">
          {steps.map((item, index) => {
            const Icon = item.icon; const active = item.id === step; const done = completed[item.id] || index < currentIndex;
            return <li key={item.id}><button type="button" disabled={!done && !active} onClick={() => (done || active) && setStep(item.id)} className={`flex w-full min-w-0 items-center gap-3 rounded-lg p-2.5 text-left transition ${active ? "border border-orange-200 bg-white text-neutral-950" : done ? "text-neutral-700 hover:bg-orange-50" : "text-neutral-500"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${active ? "bg-orange-100 text-orange-700" : done ? "bg-emerald-100 text-emerald-700" : "bg-orange-100/60 text-orange-800"}`}>{done && !active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span className="hidden min-w-0 xl:block"><span className="block text-sm font-medium">{item.label}</span><span className="mt-0.5 block truncate text-[11px] text-neutral-500">{item.helper}</span></span></button></li>;
          })}
        </ol>
      </nav>

      <main className="min-h-0 overflow-y-auto p-5 sm:p-7 xl:p-8">
        <div className="mx-auto max-w-3xl">
          {step === "apps" ? <StepApps servers={servers} attachedIds={attachedIds} selectedId={selectedId} onSelect={setSelectedId} selectedServer={selectedServer} busy={busy} onContinue={() => void attachIntegration()} /> : null}
          {step === "access" ? <StepAccess permission={permission} onPermission={setPermission} busy={busy} onContinue={() => void createToken()} /> : null}
          {step === "connect" ? <StepConnect endpoint={endpoint} rawKey={rawKey} hasToken={hasToken} onContinue={() => setStep("test")} onNewToken={() => setStep("access")} /> : null}
          {step === "test" ? <StepTest endpoint={endpoint} tested={tested} onTested={completeTest} /> : null}
          {error ? <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        </div>
      </main>
    </div>
  );
}

function StepHeading({ index, title, copy }: { index: string; title: string; copy: string }) { return <header className="mb-6"><p className="font-mono text-xs text-orange-700">STEP {index}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">{copy}</p></header>; }

function StepApps({ servers, attachedIds, selectedId, onSelect, selectedServer, busy, onContinue }: { servers: ServerOption[]; attachedIds: string[]; selectedId: string; onSelect: (id: string) => void; selectedServer?: ServerOption; busy: boolean; onContinue: () => void }) {
  const available = servers.filter((server) => !attachedIds.includes(server.id));
  return <><StepHeading index="01" title="Which apps should this workspace use?" copy="Choose one to start. You can add more later without changing the CLI connection." /><div className="grid max-h-[330px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{available.map((server) => <button key={server.id} type="button" onClick={() => onSelect(server.id)} className={`flex items-center gap-3 rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${selectedId === server.id ? "border-orange-400 bg-orange-50 text-neutral-950" : "border-neutral-200 hover:border-orange-300"}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-orange-100 text-orange-700"><Cable className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{server.name}</span><span className="mt-1 block text-xs text-neutral-500">{server.toolCount} available actions{server.presetId ? " · ready to add" : ""}</span></span>{selectedId === server.id ? <Check className="ml-auto h-4 w-4 text-orange-700" /> : null}</button>)}</div><div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4"><a href="/dashboard/generate?onboarding=1" className="text-xs font-semibold text-neutral-600 underline underline-offset-4">Connect a custom API</a><p className="text-xs text-neutral-500">{selectedServer ? `${selectedServer.toolCount} actions will become available` : "Select an app to continue"}</p></div><div className="mt-5 flex justify-end"><Button disabled={!selectedId || busy} onClick={onContinue}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Connect app <ArrowRight className="h-4 w-4" /></Button></div></>;
}

function StepAccess({ permission, onPermission, busy, onContinue }: { permission: "read_only" | "execute"; onPermission: (value: "read_only" | "execute") => void; busy: boolean; onContinue: () => void }) {
  return <><StepHeading index="02" title="What should the CLI be allowed to do?" copy="Start with standard access for normal use, or restrict this workspace to read-only actions." /><div className="space-y-2"><PermissionChoice active={permission === "execute"} title="Standard access" description="Run allowed tools and request approval when an action needs it." onClick={() => onPermission("execute")} recommended /><PermissionChoice active={permission === "read_only"} title="Read-only access" description="List, search, and inspect data. Changes are blocked." onClick={() => onPermission("read_only")} /></div><div className="mt-7 flex justify-end"><Button disabled={busy} onClick={onContinue}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Create secure access <ArrowRight className="h-4 w-4" /></Button></div></>;
}

function PermissionChoice({ active, title, description, onClick, recommended = false }: { active: boolean; title: string; description: string; onClick: () => void; recommended?: boolean }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${active ? "border-orange-400 bg-orange-50" : "border-neutral-200 hover:border-orange-300"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${active ? "border-orange-600 bg-orange-600 text-white" : "border-neutral-300"}`}>{active ? <Check className="h-3 w-3" /> : null}</span><span><span className="flex items-center gap-2 text-sm font-semibold text-neutral-950">{title}{recommended ? <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-orange-700">Recommended</span> : null}</span><span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span></span></button>; }

function StepConnect({ endpoint, rawKey, hasToken, onContinue, onNewToken }: { endpoint: string; rawKey: string | null; hasToken: boolean; onContinue: () => void; onNewToken: () => void }) {
  const command = rawKey ? `astrail login --endpoint ${endpoint} --api-key ${rawKey}` : null;
  return <><StepHeading index="03" title="Connect Astrail on this computer" copy="Run this once in Terminal. Astrail stores the workspace connection locally, so you do not need to configure each app separately." />{command ? <><CopyCommand value={command} /><div className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-800"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>This token is shown once. The copied command contains it, so do not share the command.</p></div></> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-medium text-amber-950">This workspace already has a token</p><p className="mt-1 text-xs leading-5 text-amber-800">For security, Astrail cannot show it again. Use the token you saved, or issue a new one.</p><button type="button" onClick={onNewToken} className="mt-3 text-sm font-semibold text-amber-950 underline underline-offset-4">Issue a new token</button></div>}<div className="mt-7 flex items-center justify-between"><p className="text-xs text-neutral-500">{hasToken || rawKey ? "Access is ready" : "A token is required"}</p><Button disabled={!command && !hasToken} onClick={onContinue}>I ran the command <ChevronRight className="h-4 w-4" /></Button></div></>;
}

function StepTest({ endpoint, tested, onTested }: { endpoint: string; tested: boolean; onTested: () => void }) { return <><StepHeading index="04" title="Confirm the connection" copy="Run a status check. A successful response means the CLI can reach this workspace and discover its tools." /><CopyCommand value="astrail status" /><button type="button" onClick={onTested} className={`mt-5 flex w-full items-center justify-between rounded-lg border p-4 text-left transition ${tested ? "border-emerald-200 bg-emerald-50" : "border-neutral-200 hover:border-neutral-400"}`}><span className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-md ${tested ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-500"}`}>{tested ? <Check className="h-4 w-4" /> : <TestTube2 className="h-4 w-4" />}</span><span><span className="block text-sm font-semibold text-neutral-950">{tested ? "Workspace is ready" : "Mark the status check as successful"}</span><span className="mt-1 block text-xs text-neutral-500">{tested ? "Your agent can now use this workspace." : `Expected endpoint: ${endpoint}`}</span></span></span>{tested ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ChevronRight className="h-4 w-4 text-neutral-400" />}</button></>;
}
