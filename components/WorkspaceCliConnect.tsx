"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { CopyCommand } from "@/components/control-plane/CopyCommand";

type WorkspaceCliConnectProps = {
  endpoint: string;
  workspaceId: string;
};

export function WorkspaceCliConnect({ endpoint, workspaceId }: WorkspaceCliConnectProps) {
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issueToken() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `CLI ${new Date().toLocaleDateString()}`, permission: "execute" }),
      });
      const body = await response.json() as { rawKey?: string; error?: string };
      if (!response.ok || !body.rawKey) throw new Error(body.error ?? "Could not issue a CLI token.");
      setRawKey(body.rawKey);
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : "Could not issue a CLI token.");
    } finally {
      setBusy(false);
    }
  }

  if (rawKey) {
    return (
      <div>
        <CopyCommand value={`astrail login --endpoint ${endpoint} --api-key ${rawKey} --workspace ${workspaceId}`} />
        <p className="mt-2 flex items-center gap-2 text-xs text-amber-800"><KeyRound className="h-3.5 w-3.5" /> This token is shown once. Run or store the command now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-900">Connect this computer</p>
        <p className="mt-1 truncate font-mono text-xs text-neutral-500">{endpoint}</p>
      </div>
      <button type="button" onClick={() => void issueToken()} disabled={busy} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {busy ? "Issuing token" : "Issue CLI token"}
      </button>
      {error ? <p role="alert" className="text-sm text-red-700 sm:basis-full">{error}</p> : null}
    </div>
  );
}
