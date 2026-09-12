"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopySnippet } from "@/components/CopySnippet";
import { readJsonResponse } from "@/lib/client-json";

type WorkerBundle = {
  files: Array<{ path: string; content: string }>;
};

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "astrail-worker";
}

export function WorkerExportPanel({ serverId, serverName }: { serverId: string; serverName: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportWorkerBundle() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/worker`);
      const bundle = await readJsonResponse<WorkerBundle & { error?: string }>(response);
      if (!response.ok) throw new Error(bundle.error ?? "Could not export Worker bundle.");
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(serverName)}-worker-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export Worker bundle.");
    } finally {
      setLoading(false);
    }
  }

  const deployCommands = `# 1. Click "Export Worker bundle" and unpack the JSON into files.
# 2. Install dependencies inside the exported folder.
npm install

# 3. Add secrets if the exported runtime is private or needs upstream credentials.
npx wrangler secret put ASTRAIL_API_KEY

# 4. Optional manual deploy to Cloudflare Workers after review.
npx wrangler deploy`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloudflare Worker export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Export a Worker-ready MCP runtime with curated tools, business context, governance manifest, and deterministic execution for public REST endpoints.
          Authenticated and approval-gated tools fail closed until you add reviewed self-hosted adapters.
        </p>
        <div className="border bg-background p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How hosting works</p>
          <p className="mt-1">
            Astrail hosts the full endpoint immediately at `/api/mcp/{serverId}` with per-user credentials, approvals, and logs. Worker export is the portable path for teams that want to own deployment and review every runtime boundary.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportWorkerBundle} disabled={loading}>
          <Download className="h-4 w-4" />
          {loading ? "Preparing export..." : "Export Worker bundle"}
        </Button>
        <CopySnippet title="Manual Worker export commands" code={deployCommands} />
        {error && <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
