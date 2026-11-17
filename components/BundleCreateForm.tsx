"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EndpointBox } from "@/components/EndpointBox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BundleServerOption = {
  id: string;
  name: string;
  toolCount: number;
};

export function BundleCreateForm({ servers }: { servers: BundleServerOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("My work stack");
  const [selected, setSelected] = useState<string[]>(servers.slice(0, 3).map((server) => server.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEndpoint, setCreatedEndpoint] = useState<string | null>(null);

  function toggle(serverId: string) {
    setSelected((current) =>
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId]
    );
  }

  async function createBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedEndpoint(null);
    try {
      const response = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, serverIds: selected }),
      });
      const text = await response.text();
      const result = text
        ? JSON.parse(text) as { bundle?: { hosted_endpoint?: string | null }; error?: string }
        : { error: "Bundle endpoint returned an empty response." };
      if (!response.ok) throw new Error(result.error ?? "Could not create bundle.");
      setCreatedEndpoint(result.bundle?.hosted_endpoint ?? null);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create bundle.");
    } finally {
      setLoading(false);
    }
  }

  if (servers.length === 0) {
    return <p className="text-sm text-muted-foreground">Generate or add servers before creating a bundle.</p>;
  }

  return (
    <form onSubmit={createBundle} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bundle-name">Bundle name</Label>
        <Input id="bundle-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      {createdEndpoint && (
        <EndpointBox
          endpoint={createdEndpoint}
          label="Bundle ready"
          note="Copy this MCP URL into your agent client. Private bundles also need an Astrail API key."
        />
      )}
      <div className="space-y-2">
        <Label>Servers</Label>
        <div className="divide-y border">
          {servers.map((server) => (
            <label key={server.id} className="flex cursor-pointer items-center justify-between gap-3 p-3 text-sm">
              <span>
                <span className="block font-medium">{server.name}</span>
                <span className="text-muted-foreground">{server.toolCount} tools</span>
              </span>
              <input
                type="checkbox"
                checked={selected.includes(server.id)}
                onChange={() => toggle(server.id)}
                className="h-4 w-4"
              />
            </label>
          ))}
        </div>
      </div>
      <Button disabled={loading || selected.length === 0}>
        <Boxes className="h-4 w-4" />
        {loading ? "Creating..." : "Create bundle"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
