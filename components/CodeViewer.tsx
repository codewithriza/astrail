"use client";

import { Download, Copy, Check, FileCode2, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const syntaxPattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|const|let|var|new|return|await|async|function|type|interface|export|default|class|extends|if|else|try|catch|throw|for|of|in|while|switch|case|break|true|false|null|undefined)\b|\b[A-Z][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:])/g;

function syntaxClass(token: string) {
  if (token.startsWith("//") || token.startsWith("/*")) return "text-neutral-400";
  if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) return "text-emerald-700";
  if (/^\d/.test(token)) return "text-fuchsia-700";
  if (/^[{}()[\].,;:]$/.test(token)) return "text-neutral-500";
  if (/^[A-Z]/.test(token)) return "text-sky-700";
  return "text-orange-600";
}

function highlightTypeScript(source: string) {
  const parts = [];
  let lastIndex = 0;
  syntaxPattern.lastIndex = 0;

  let match = syntaxPattern.exec(source);
  while (match) {
    const token = match[0];
    const index = match.index;

    if (index > lastIndex) parts.push(source.slice(lastIndex, index));
    parts.push(
      <span key={`${index}-${token}`} className={syntaxClass(token)}>
        {token}
      </span>,
    );
    lastIndex = index + token.length;
    match = syntaxPattern.exec(source);
  }

  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

export function CodeViewer({ code, fileName = "server.ts" }: { code: string; fileName?: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasCode = code.trim().length > 0;
  const editorHeight = useMemo(() => {
    if (expanded) return "calc(100dvh - 120px)";
    if (!hasCode) return "220px";
    const lineCount = Math.max(1, code.split(/\r\n|\n|\r/).length);
    return `${Math.min(760, Math.max(420, lineCount * 22 + 28))}px`;
  }, [code, expanded, hasCode]);

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  async function copyCode() {
    if (!hasCode) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadCode() {
    if (!hasCode) return;
    const blob = new Blob([code], { type: "text/typescript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const containerClassName = expanded
    ? "fixed inset-3 z-[90] min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm sm:inset-6"
    : "min-w-0 self-start overflow-hidden rounded-md border bg-card xl:sticky xl:top-4";

  return (
    <div className={containerClassName}>
      <div className="grid min-w-0 gap-2 border-b px-3 py-2 sm:flex sm:items-center sm:justify-between">
        <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">{fileName}</span>
        {hasCode ? (
          <div className="grid min-w-0 grid-cols-3 gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Collapse editor" : "Expand editor"} className="min-w-0 px-2 sm:px-3">
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="truncate">{expanded ? "Collapse" : "Expand"}</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copyCode} className="min-w-0 px-2 sm:px-3">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="truncate">{copied ? "Copied" : "Copy"}</span>
            </Button>
            <Button type="button" size="sm" onClick={downloadCode} aria-label={`Download ${fileName}`} className="min-w-0 px-2 sm:px-3">
              <Download className="h-4 w-4" />
              <span className="truncate">Download</span>
            </Button>
          </div>
        ) : (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5" />
            Source unavailable
          </span>
        )}
      </div>
      {hasCode ? (
        <pre
          className="overflow-auto bg-white p-4 font-mono text-xs leading-6 text-neutral-800"
          style={{ height: editorHeight }}
        >
          <code>{highlightTypeScript(code)}</code>
        </pre>
      ) : (
        <div className="grid min-h-[220px] place-items-center p-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border bg-muted">
              <FileCode2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 font-medium">No source saved</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This endpoint can still run. Regenerate it or export the SDK bundle to pull fresh files.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
