"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readJsonResponse } from "@/lib/client-json";

export function AddToGatewayButton({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cloneServer() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace/${serverId}/clone`, { method: "POST" });
      const result = await readJsonResponse<{ id?: string; error?: string }>(response);
      if (!response.ok || !result.id) throw new Error(result.error ?? "Could not add server.");
      router.push(`/dashboard/servers/${result.id}?auth=1`);
      router.refresh();
    } catch (cloneError) {
      setError(cloneError instanceof Error ? cloneError.message : "Could not add server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={cloneServer} disabled={loading}>
        <CopyPlus className="h-4 w-4" />
        {loading ? "Adding..." : "Add to my gateway"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
