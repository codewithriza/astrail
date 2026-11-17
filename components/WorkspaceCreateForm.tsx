"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleUserRound, FlaskConical, Loader2, RadioTower } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const environments = [
  { id: "personal", label: "Personal", icon: CircleUserRound },
  { id: "staging", label: "Staging", icon: FlaskConical },
  { id: "production", label: "Production", icon: RadioTower },
] as const;

export function WorkspaceCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<(typeof environments)[number]["id"]>("personal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, environment }),
      });
      const body = await response.json() as { error?: string; workspace?: { id?: string } };
      if (!response.ok) throw new Error(body.error ?? "Could not create workspace.");
      if (body.workspace?.id) router.push(`/dashboard/workspaces/${body.workspace.id}`);
      else router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Name</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Product operations"
          autoComplete="off"
          required
          className="h-11 bg-white"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-900">Environment</legend>
        <div className="grid grid-cols-3 gap-2">
          {environments.map((item) => {
            const Icon = item.icon;
            const selected = item.id === environment;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setEnvironment(item.id)}
                aria-pressed={selected}
                className={`relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${selected ? "border-orange-500 bg-orange-50 text-orange-950" : "border-neutral-200 bg-white text-neutral-600 hover:border-orange-300 hover:text-neutral-950"}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {selected ? <Check className="absolute right-2 top-2 h-3 w-3 text-orange-300" /> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Button disabled={busy || !name.trim()} className="h-11 w-full justify-between px-4 active:translate-y-px">
        <span>{busy ? "Creating workspace" : "Create workspace"}</span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      </Button>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
