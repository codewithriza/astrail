"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

export function CopyCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-orange-200 bg-white/90 shadow-[0_10px_30px_rgba(118,72,31,0.07)]">
      <div className="flex h-10 items-center justify-between border-b border-orange-100 bg-[#fff8ed] px-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-neutral-700"><Terminal className="h-3.5 w-3.5 text-orange-700" /> Terminal command</span>
        <button type="button" onClick={() => void copy()} aria-label="Copy command" className="inline-flex h-7 min-w-16 items-center justify-center gap-1.5 rounded-md border border-orange-200 bg-white px-2 text-xs font-semibold text-orange-800 transition hover:bg-orange-50 active:translate-y-px">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-28 overflow-y-auto p-3 sm:p-4">
        <code className="block whitespace-pre-wrap font-mono text-xs leading-5 text-neutral-700 [overflow-wrap:anywhere]">{value}</code>
      </div>
    </div>
  );
}
