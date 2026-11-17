"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Code2, Database, KeyRound, Loader2, Search, ShieldCheck, Sparkles, Terminal, Workflow } from "lucide-react";
import { CopyCommand } from "@/components/control-plane/CopyCommand";
import { Button } from "@/components/ui/button";

export type OnboardingApp = { id: string; name: string; description: string; icon: string; toolCount: number };

const goals = [
  { id: "assistant", title: "Give an AI assistant access", copy: "Find information and take approved actions.", icon: Sparkles },
  { id: "automation", title: "Automate repetitive work", copy: "Use several apps through one connection.", icon: Workflow },
  { id: "data", title: "Search company knowledge", copy: "Make files, docs, and data available.", icon: Database },
  { id: "developer", title: "Build with an API", copy: "Turn an API into tools for your agents.", icon: Code2 },
];

const stepLabels = ["Welcome", "Your goal", "Choose an app", "Set access", "Ready"];
const goalProfiles: Record<string, { appCopy: string; recommended: string[] }> = {
  assistant: { appCopy: "These apps are common starting points for assistants that need useful context and approved actions.", recommended: ["preset-google-drive", "preset-notion", "preset-slack", "preset-gmail"] },
  automation: { appCopy: "Start with the system where repetitive work happens most often.", recommended: ["preset-linear", "preset-airtable", "preset-slack", "preset-hubspot"] },
  data: { appCopy: "Start with the source that contains the knowledge your team uses most.", recommended: ["preset-google-drive", "preset-notion", "preset-google-sheets", "preset-google-docs"] },
  developer: { appCopy: "Start with a developer platform, or connect your own API contract.", recommended: ["preset-github", "preset-vercel", "preset-linear", "preset-figma"] },
};
type Result = { workspaceId: string; workspaceName: string; endpoint: string; rawKey: string };

export function OnboardingFlow({ apps }: { apps: OnboardingApp[] }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("assistant");
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const [permission, setPermission] = useState<"execute" | "read_only">("execute");
  const [workspaceName, setWorkspaceName] = useState("My workspace");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [created, setCreated] = useState<{ workspace?: { id: string; name: string }; serverId?: string }>({});
  const stageRef = useRef<HTMLElement>(null);
  const selectedApp = apps.find((app) => app.id === appId);
  const goalProfile = goalProfiles[goal] ?? goalProfiles.assistant;
  const filteredApps = useMemo(() => {
    const recommendationRank = new Map(goalProfile.recommended.map((id, index) => [id, index]));
    return apps
      .filter((app) => `${app.name} ${app.description}`.toLowerCase().includes(search.toLowerCase()))
      .sort((left, right) => (recommendationRank.get(left.id) ?? 99) - (recommendationRank.get(right.id) ?? 99));
  }, [apps, goalProfile.recommended, search]);

  function chooseGoal(nextGoal: string) {
    const profile = goalProfiles[nextGoal] ?? goalProfiles.assistant;
    setGoal(nextGoal);
    setAppId(profile.recommended.find((id) => apps.some((app) => app.id === id)) ?? apps[0]?.id ?? "");
    setSearch("");
  }

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    stageRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  async function provision() {
    if (!selectedApp || !workspaceName.trim()) return;
    setBusy(true); setError(null);
    try {
      let workspace = created.workspace;
      if (!workspace) {
        const response = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: workspaceName.trim(), environment: "personal" }) });
        const body = await response.json() as { workspace?: { id: string; name: string }; error?: string };
        if (!response.ok || !body.workspace) throw new Error(body.error ?? "Could not create your workspace.");
        workspace = body.workspace; setCreated((current) => ({ ...current, workspace }));
      }
      let serverId = created.serverId;
      if (!serverId) {
        const response = await fetch(`/api/marketplace/${selectedApp.id}/clone`, { method: "POST" });
        const body = await response.json() as { id?: string; error?: string };
        if (!response.ok || !body.id) throw new Error(body.error ?? "Could not add this app.");
        serverId = body.id; setCreated((current) => ({ ...current, serverId }));
      }
      const attached = await fetch(`/api/workspaces/${workspace.id}/integrations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ server_id: serverId }) });
      const attachedBody = await attached.json() as { error?: string };
      if (!attached.ok) throw new Error(attachedBody.error ?? "Could not connect this app.");
      const tokenResponse = await fetch(`/api/workspaces/${workspace.id}/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "First CLI connection", permission }) });
      const tokenBody = await tokenResponse.json() as { rawKey?: string; error?: string };
      if (!tokenResponse.ok || !tokenBody.rawKey) throw new Error(tokenBody.error ?? "Could not create secure access.");
      setResult({ workspaceId: workspace.id, workspaceName: workspace.name, endpoint: `${window.location.origin}/api/mcp/workspaces/${workspace.id}`, rawKey: tokenBody.rawKey });
      window.localStorage.setItem("astrail_onboarding_complete", "true"); setStep(4);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Setup could not be completed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] min-h-dvh overflow-hidden bg-[#f6eee2] text-neutral-950">
      <picture className="pointer-events-none absolute inset-0">
        <source media="(max-width: 639px)" srcSet="/onboarding/astrail-landscape-mobile.png" />
        <img src="/onboarding/astrail-landscape-desktop.png" alt="" className="h-full w-full object-cover object-bottom" />
      </picture>
      <header className="relative z-10 flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/dashboard" className="flex items-center gap-2.5 text-sm font-semibold"><Image src="/brand/astrail-mark.svg" alt="Astrail" width={28} height={28} /><span>Astrail</span></Link>
        <Link href="/dashboard" className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950">Exit setup</Link>
      </header>

      <main className="relative z-10 flex h-[calc(100dvh-64px)] flex-col items-center px-5 pb-6">
        <Progress step={step} onStep={(next) => next < step && setStep(next)} />
        <section ref={stageRef} className="flex min-h-0 w-full max-w-[720px] flex-1 items-start justify-center overflow-y-auto pt-8 sm:items-center sm:pb-24 sm:pt-5">
          <div className="w-full">
            {step === 0 ? <Welcome apps={apps} onContinue={() => setStep(1)} /> : null}
            {step === 1 ? <GoalStep goal={goal} onGoal={chooseGoal} onBack={() => setStep(0)} onContinue={() => setStep(2)} /> : null}
            {step === 2 ? <AppStep apps={filteredApps} selectedId={appId} search={search} appCopy={goalProfile.appCopy} recommendedIds={goalProfile.recommended} onSearch={setSearch} onSelect={setAppId} onBack={() => setStep(1)} onContinue={() => setStep(3)} /> : null}
            {step === 3 ? <AccessStep workspaceName={workspaceName} onWorkspaceName={setWorkspaceName} permission={permission} onPermission={setPermission} busy={busy} error={error} onBack={() => setStep(2)} onContinue={() => void provision()} /> : null}
            {step === 4 && result ? <ReadyStep result={result} appName={selectedApp?.name ?? "Your app"} /> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function Progress({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return <nav aria-label="Onboarding progress" className="mt-3 w-full max-w-[430px]"><ol className="flex items-start">{stepLabels.map((label, index) => <li key={label} className="relative flex flex-1 flex-col items-center last:flex-none">{index < stepLabels.length - 1 ? <span className={`absolute left-1/2 top-4 h-0.5 w-full ${index < step ? "bg-orange-500" : "bg-[#d8c5ad]"}`} /> : null}<button type="button" onClick={() => onStep(index)} disabled={index >= step} aria-current={index === step ? "step" : undefined} className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-semibold transition ${index < step ? "border-orange-500 bg-orange-500 text-white" : index === step ? "border-orange-600 bg-[#f6eee2] text-orange-800" : "border-[#d8c5ad] bg-[#eadfce] text-neutral-500"}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</button><span className={`mt-2 hidden text-[10px] font-medium sm:block ${index === step ? "text-neutral-900" : "text-neutral-500"}`}>{label}</span></li>)}</ol></nav>;
}

function Welcome({ apps, onContinue }: { apps: OnboardingApp[]; onContinue: () => void }) {
  return <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Your AI workspace</p><h1 className="mx-auto mt-3 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Connect your tools once.<br />Use them everywhere.</h1><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-neutral-600 sm:text-base">Astrail gives your AI assistants one secure connection to every app and API you choose.</p><div className="mx-auto mt-8 flex max-w-md items-center justify-center"><div className="h-px flex-1 bg-orange-300" />{apps.slice(0, 4).map((app) => <span key={app.id} className="-ml-1 grid h-12 w-12 place-items-center rounded-xl border border-orange-200 bg-white shadow-[0_8px_24px_rgba(151,75,14,0.10)]"><Image src={app.icon} alt={app.name} width={24} height={24} /></span>)}<span className="-ml-1 grid h-14 w-14 place-items-center rounded-xl bg-orange-600 text-white shadow-[0_10px_28px_rgba(194,65,12,0.22)]"><Image src="/brand/astrail-mark.svg" alt="Astrail" width={28} height={28} className="brightness-0 invert" /></span><div className="h-px flex-1 bg-orange-300" /></div><Button className="mt-9 h-11 bg-orange-600 px-7 text-white hover:bg-orange-700" onClick={onContinue}>Set up Astrail <ArrowRight className="h-4 w-4" /></Button><p className="mt-3 text-xs text-neutral-500">About two minutes · No code required</p></div>;
}

function GoalStep({ goal, onGoal, onBack, onContinue }: { goal: string; onGoal: (goal: string) => void; onBack: () => void; onContinue: () => void }) {
  return <div><StepHeading title="What should Astrail help you do?" copy="Your answer changes which apps Astrail recommends next. It never changes security permissions." /><div className="grid gap-3 sm:grid-cols-2">{goals.map((item) => { const Icon = item.icon; const active = goal === item.id; return <button key={item.id} onClick={() => onGoal(item.id)} className={`flex items-center gap-4 rounded-lg border p-4 text-left transition ${active ? "border-orange-500 bg-white shadow-[0_10px_28px_rgba(151,75,14,0.09)]" : "border-[#ddcfbd] bg-white/55 hover:border-orange-300 hover:bg-white"}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${active ? "bg-orange-600 text-white" : "bg-[#eadfce] text-neutral-600"}`}><Icon className="h-5 w-5" /></span><span><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-neutral-500">{item.copy}</span></span>{active ? <Check className="ml-auto h-4 w-4 text-orange-700" /> : null}</button>; })}</div><StepActions onBack={onBack} onContinue={onContinue} /></div>;
}

function AppStep({ apps, selectedId, search, appCopy, recommendedIds, onSearch, onSelect, onBack, onContinue }: { apps: OnboardingApp[]; selectedId: string; search: string; appCopy: string; recommendedIds: string[]; onSearch: (value: string) => void; onSelect: (id: string) => void; onBack: () => void; onContinue: () => void }) {
  return <div><StepHeading title="Choose your first app" copy={appCopy} /><div className="relative mb-3"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search apps" className="h-11 w-full rounded-lg border border-[#ddcfbd] bg-white/80 pl-10 pr-3 text-sm outline-none focus:border-orange-500" /></div><div className="grid max-h-[290px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{apps.map((app) => { const recommended = recommendedIds.includes(app.id); return <button key={app.id} onClick={() => onSelect(app.id)} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${selectedId === app.id ? "border-orange-500 bg-white" : "border-[#ddcfbd] bg-white/55 hover:border-orange-300 hover:bg-white"}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white"><Image src={app.icon} alt="" width={22} height={22} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{app.name}</span><span className={`block text-xs ${recommended ? "font-medium text-orange-700" : "text-neutral-500"}`}>{recommended ? "Recommended" : `${app.toolCount} ready actions`}</span></span>{selectedId === app.id ? <Check className="ml-auto h-4 w-4 text-orange-700" /> : null}</button>; })}</div><div className="mt-3 text-center"><Link href="/dashboard/generate?onboarding=1" className="text-sm font-medium text-orange-800 underline underline-offset-4">Connect a custom API instead</Link></div><StepActions onBack={onBack} onContinue={onContinue} disabled={!selectedId} /></div>;
}

function AccessStep({ workspaceName, onWorkspaceName, permission, onPermission, busy, error, onBack, onContinue }: { workspaceName: string; onWorkspaceName: (value: string) => void; permission: "execute" | "read_only"; onPermission: (value: "execute" | "read_only") => void; busy: boolean; error: string | null; onBack: () => void; onContinue: () => void }) {
  return <div><StepHeading title="Name it and choose access" copy="Your workspace keeps apps and permissions together behind one secure connection." /><label className="block text-sm font-semibold">Workspace name<input value={workspaceName} onChange={(event) => onWorkspaceName(event.target.value)} maxLength={80} className="mt-2 h-11 w-full rounded-lg border border-[#ddcfbd] bg-white/80 px-3 text-sm outline-none focus:border-orange-500" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><AccessChoice active={permission === "execute"} title="Standard access" copy="Read data and run allowed actions. Sensitive changes still require approval." recommended onClick={() => onPermission("execute")} /><AccessChoice active={permission === "read_only"} title="Read only" copy="Search and inspect data. Astrail blocks changes." onClick={() => onPermission("read_only")} /></div><div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/90 p-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p className="text-xs leading-5 text-emerald-900"><strong>Your app secret stays in Astrail.</strong> The CLI receives a revocable workspace token, never provider credentials.</p></div>{error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<StepActions onBack={onBack} onContinue={onContinue} disabled={busy || !workspaceName.trim()} label={busy ? "Creating workspace…" : "Create workspace"} loading={busy} /></div>;
}

function ReadyStep({ result, appName }: { result: Result; appName: string }) {
  return <div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></div><h1 className="mt-4 text-3xl font-semibold tracking-tight">{result.workspaceName} is ready</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-600">{appName} is connected. Run this command once to connect the Astrail CLI.</p><div className="mx-auto mt-6 max-w-xl text-left"><CopyCommand value={`astrail login --endpoint ${result.endpoint} --api-key ${result.rawKey}`} /><p className="mt-2 flex items-center gap-2 text-xs text-amber-800"><KeyRound className="h-3.5 w-3.5" /> This secure token is shown once. Keep the command private.</p></div><div className="mx-auto mt-5 flex max-w-xl items-center justify-between rounded-lg border border-[#ddcfbd] bg-white/65 p-3 text-left"><div><p className="text-xs font-semibold text-neutral-500">Check the connection</p><code className="mt-1 block font-mono text-sm">astrail status</code></div><Terminal className="h-5 w-5 text-orange-700" /></div><div className="mt-6 flex justify-center gap-3"><Link href="/dashboard" className="inline-flex h-11 items-center gap-2 rounded-lg bg-orange-600 px-5 text-sm font-semibold text-white transition hover:bg-orange-700">Go to dashboard <ArrowRight className="h-4 w-4" /></Link><Link href={`/dashboard/workspaces/${result.workspaceId}`} className="inline-flex h-11 items-center px-4 text-sm font-semibold text-neutral-600">View workspace</Link></div></div>;
}

function StepHeading({ title, copy }: { title: string; copy: string }) { return <header className="mb-5 text-center"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-600">{copy}</p></header>; }
function StepActions({ onBack, onContinue, disabled, label = "Continue", loading }: { onBack: () => void; onContinue: () => void; disabled?: boolean; label?: string; loading?: boolean }) { return <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onBack} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#d8c5ad] bg-[#eadfce] text-sm font-semibold text-neutral-700 transition hover:bg-[#e2d3bf]"><ArrowLeft className="h-4 w-4" /> Back</button><button type="button" onClick={onContinue} disabled={disabled} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{label} {!loading ? <ArrowRight className="h-4 w-4" /> : null}</button></div>; }
function AccessChoice({ active, title, copy, recommended, onClick }: { active: boolean; title: string; copy: string; recommended?: boolean; onClick: () => void }) { return <button onClick={onClick} className={`rounded-lg border p-4 text-left transition ${active ? "border-orange-500 bg-white" : "border-[#ddcfbd] bg-white/55 hover:border-orange-300 hover:bg-white"}`}><span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{title}</span>{recommended ? <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-orange-700">Recommended</span> : null}</span><span className="mt-2 block text-xs leading-5 text-neutral-500">{copy}</span></button>; }
