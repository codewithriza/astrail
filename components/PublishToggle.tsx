"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Globe2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readJsonResponse } from "@/lib/client-json";

type ServerUpdateResponse = {
  error?: string;
  server?: {
    is_public?: boolean;
  };
};

export function PublishToggle({ serverId, isPublic }: { serverId: string; isPublic: boolean }) {
  const router = useRouter();
  const lastServerId = useRef(serverId);
  const [currentIsPublic, setCurrentIsPublic] = useState(isPublic);
  const [confirmedIsPublic, setConfirmedIsPublic] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lastServerId.current !== serverId) {
      lastServerId.current = serverId;
      setCurrentIsPublic(isPublic);
      setConfirmedIsPublic(null);
      return;
    }

    if (confirmedIsPublic !== null && isPublic !== confirmedIsPublic) return;
    setCurrentIsPublic(isPublic);
    setConfirmedIsPublic(null);
  }, [confirmedIsPublic, isPublic, serverId]);

  async function toggle() {
    if (loading) return;

    const nextIsPublic = !currentIsPublic;

    setLoading(true);
    setError(null);

    const response = await fetch(`/api/servers/${serverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: nextIsPublic }),
    });

    const result = await readJsonResponse<ServerUpdateResponse>(response);

    if (!response.ok) {
      setError(result.error ?? "Could not update visibility.");
      setLoading(false);
      return;
    }

    const updatedIsPublic = result.server?.is_public ?? nextIsPublic;
    setCurrentIsPublic(updatedIsPublic);
    setConfirmedIsPublic(updatedIsPublic);
    setLoading(false);
    router.refresh();
  }

  const actionLabel = currentIsPublic ? "Make private" : "Make public";
  const loadingLabel = currentIsPublic ? "Making private..." : "Publishing...";

  return (
    <div className="space-y-2">
      <Button type="button" variant={currentIsPublic ? "secondary" : "default"} onClick={toggle} disabled={loading}>
        {currentIsPublic ? <Lock className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
        {loading ? loadingLabel : actionLabel}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
