"use client";

import { Check, Copy, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export function PublicEndpointPanel() {
  const [origin, setOrigin] = useState("https://astrail.dev");
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const endpoint = `${origin}/api/mcp/petstore-code-mode`;
  const curl = useMemo(() => `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"inventory"}}}'`, [endpoint]);
  const executeCurl = useMemo(() => `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute","arguments":{"code":"async function run(client) { return await client.store.getInventory({}); }","result_mode":"compact"}}}'`, [endpoint]);

  async function copy() {
    await navigator.clipboard.writeText(`${curl}\n\n${executeCurl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function testEndpoint() {
    setTesting(true);
    setTestOk(false);

    try {
      const response = await fetch("/api/mcp/petstore-code-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const payload = await response.json();
      const tools = payload?.result?.tools;
      setTestOk(response.ok && Array.isArray(tools));
      setTimeout(() => setTestOk(false), 1600);
    } catch {
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-w-0 border border-white/10 bg-[#090b08] p-5 text-white shadow-sm">
      <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="pixel-text text-xs text-lime-300">public code mode endpoint</p>
          <h2 className="mt-2 text-xl font-black">Call search_docs, then execute SDK-shaped code.</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copy} className="border-white/15 bg-white text-black hover:border-lime-300">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy curl"}
          </Button>
          <Button type="button" onClick={testEndpoint} disabled={testing} className="border-orange-500 bg-orange-600 text-white hover:border-lime-300 hover:bg-orange-700">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : testOk ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {testOk ? "Endpoint OK" : "Test endpoint"}
          </Button>
        </div>
      </div>

      <div className="mt-5 min-w-0 border border-white/10 bg-black/35 p-4 font-mono text-xs leading-6 text-white/62">
        <p className="mb-3 break-all text-white/28">{endpoint}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all">{curl}</pre>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all border-t border-white/10 pt-4">{executeCurl}</pre>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="border border-lime-300/30 bg-lime-300/10 px-2 py-1 text-lime-200">public</span>
        <span className="border border-white/10 bg-white/[0.035] px-2 py-1 text-white/48">JSON-RPC 2.0</span>
        <span className="border border-white/10 bg-white/[0.035] px-2 py-1 text-white/48">search_docs</span>
        <span className="border border-white/10 bg-white/[0.035] px-2 py-1 text-white/48">execute</span>
        <span className="border border-white/10 bg-white/[0.035] px-2 py-1 text-white/48">no eval</span>
        <span className="border border-white/10 bg-white/[0.035] px-2 py-1 text-white/48">parallel reads</span>
      </div>
    </div>
  );
}
