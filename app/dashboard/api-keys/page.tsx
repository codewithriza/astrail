"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readJsonResponse } from "@/lib/client-json";
import { formatDate } from "@/lib/utils";
import type { ApiKey } from "@/lib/types";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("Default key");
  const [endUserId, setEndUserId] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [agentId, setAgentId] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadKeys() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/apikeys");
      const result = await readJsonResponse<{ keys?: ApiKey[]; error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? "Could not load API keys.");
      setKeys(result.keys ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load API keys.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setRawKey(null);
    setCopied(false);
    setError(null);

    try {
      const response = await fetch("/api/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, end_user_id: endUserId || undefined, actor_role: actorRole || undefined, agent_id: agentId || undefined }),
      });
      const result = await readJsonResponse<{ key?: ApiKey; rawKey?: string; error?: string }>(response);
      if (!response.ok || !result.key || !result.rawKey) throw new Error(result.error ?? "Could not create key.");
      setRawKey(result.rawKey);
      setKeys((current) => [result.key as ApiKey, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create key.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/apikeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deleteTarget.id,
          confirmation: deleteConfirmation,
        }),
      });
      const result = await readJsonResponse<{ deleted?: boolean; error?: string }>(response);
      if (!response.ok || !result.deleted) throw new Error(result.error ?? "Could not delete key.");
      setKeys((current) => current.filter((key) => key.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete key.");
    } finally {
      setDeleting(false);
    }
  }

  async function copyRawKey() {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Runtime access</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">API keys</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/docs#auth">View auth docs</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/settings">Workspace settings</Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="console-card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 md:flex-row md:items-start">
              <SectionTitle
                icon={KeyRound}
                title="Create key"
              />
              <StatusPill tone={keys.length > 0 ? "success" : "neutral"}>
                {keys.length > 0 ? `${keys.length} active` : "Ready"}
              </StatusPill>
            </div>
            <form onSubmit={createKey} className="mt-5 grid gap-3 md:grid-cols-2 md:items-end">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key name</Label>
                <Input id="keyName" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endUserId">End-user ID (optional)</Label>
                <Input id="endUserId" value={endUserId} onChange={(event) => setEndUserId(event.target.value)} placeholder="customer_82" maxLength={256} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actorRole">Actor role (optional)</Label>
                <Input id="actorRole" value={actorRole} onChange={(event) => setActorRole(event.target.value)} placeholder="operator" maxLength={64} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agentId">Trusted agent ID (enables task authorization)</Label>
                <Input id="agentId" value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="support-agent" maxLength={120} />
              </div>
              <Button disabled={creating}>
                <KeyRound className="h-4 w-4" />
                {creating ? "Creating..." : "Create key"}
              </Button>
            </form>
            {rawKey ? (
              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <p className="text-sm font-medium text-neutral-950">Copy this key now. It will not be shown again.</p>
                    <p className="mt-1 text-xs text-neutral-500">Use it as Authorization: Bearer for private MCP endpoints.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={copyRawKey}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                </div>
                <code className="mt-3 block break-all rounded-md border border-neutral-200 bg-white p-3 text-sm">{rawKey}</code>
              </div>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </section>

          <section className="console-card overflow-hidden">
            <div className="border-b border-neutral-200 p-5 sm:p-6">
              <SectionTitle title="Existing keys" />
            </div>
            {loading ? (
              <p className="p-5 text-sm text-neutral-500 sm:p-6">Loading keys...</p>
            ) : keys.length === 0 ? (
              <div className="p-5 sm:p-6">
                <p className="text-sm font-medium text-neutral-950">No API keys yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {keys.map((key) => (
                  <div key={key.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-950">{key.name}</p>
                      <p className="mt-1 truncate font-mono text-sm text-neutral-500">{key.key_preview}</p>
                      {(key.end_user_id || key.actor_role || key.agent_id) && <p className="mt-1 text-xs text-neutral-500">Scoped to {key.end_user_id ?? "workspace"} · {key.actor_role ?? "default role"} · agent {key.agent_id ?? "legacy/unbound"}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-sm text-neutral-500">{formatDate(key.created_at)}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDeleteTarget(key);
                          setDeleteConfirmation("");
                          setError(null);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="console-card p-5 sm:p-6">
            <SectionTitle title="Where keys are used" />
            <div className="mt-5 grid gap-2 text-sm text-neutral-600">
              <p>Private endpoints</p>
              <p>SDK exports</p>
              <p>External clients</p>
            </div>
          </section>
        </aside>
      </section>

      {deleteTarget ? (
        <section className="console-card border-destructive/40 p-5 sm:p-6">
          <SectionTitle
            icon={AlertCircle}
            title="Delete API key"
            description="This cannot be undone. Type the key name to confirm deletion."
          />
          <form onSubmit={deleteKey} className="mt-5 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type <code>{deleteTarget.name}</code> to delete this key
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                variant="destructive"
                disabled={deleting || deleteConfirmation !== deleteTarget.name}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting..." : "Delete API key"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function SectionTitle({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: typeof KeyRound;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-950">
        {Icon ? <Icon className="h-4 w-4 text-orange-600" /> : null}
        {title}
      </h2>
      {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">{description}</p> : null}
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: "success" | "neutral" }) {
  const toneClass = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-neutral-200 bg-neutral-50 text-neutral-600";

  return (
    <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
