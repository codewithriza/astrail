"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EndpointBox({
  endpoint,
  label = "Hosted MCP endpoint",
  note = "Private servers require an Astrail API key in the Authorization header.",
}: {
  endpoint: string;
  label?: string;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyEndpoint() {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-card p-4 transition-all duration-300",
        copied && "border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]"
      )}
    >
      {copied && (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 shadow-sm">
          <Sparkles className="h-3 w-3 animate-pulse" />
          Ready to paste
        </div>
      )}
      <div className="mb-2 pr-28">
        <p className="text-sm font-medium">{label}</p>
      </div>
      <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border bg-muted">
        <code className="min-w-0 flex-1 overflow-x-auto px-3 py-3 text-sm leading-8">{endpoint}</code>
        <Button
          type="button"
          variant={copied ? "default" : "outline"}
          onClick={copyEndpoint}
          className={cn(
            "m-2 h-10 min-w-28 shrink-0 transition-all duration-200",
            copied && "scale-[1.02] bg-emerald-600 text-white hover:bg-emerald-600"
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy URL"}</span>
        </Button>
      </div>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
