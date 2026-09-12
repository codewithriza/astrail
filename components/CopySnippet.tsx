"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopySnippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-md border bg-background">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b px-3 py-2">
        <p className="min-w-0 truncate text-sm font-medium">{title}</p>
        <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 text-xs leading-5 text-muted-foreground">
        <code className="block min-w-max">{code}</code>
      </pre>
    </div>
  );
}
