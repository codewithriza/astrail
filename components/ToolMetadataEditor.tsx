"use client";

import { useState } from "react";
import { Eye, EyeOff, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readJsonResponse } from "@/lib/client-json";
import { applyToolGovernanceRecommendation, assessToolGovernance } from "@/lib/tool-governance";
import type { AstrailToolProfile, McpTool, McpToolPolicy } from "@/lib/types";

type ContextField = "business_context" | "use_when" | "avoid_when" | "edge_case_notes";

export function ToolMetadataEditor({
  serverId,
  tools,
  initialBusinessContext,
}: {
  serverId: string;
  tools: McpTool[];
  initialBusinessContext?: string | null;
}) {
  const [items, setItems] = useState(tools);
  const [businessContext, setBusinessContext] = useState(initialBusinessContext ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateDescription(index: number, description: string) {
    setItems((current) =>
      current.map((tool, toolIndex) => toolIndex === index ? { ...tool, description } : tool)
    );
  }

  function updatePolicy(index: number, policy: McpToolPolicy) {
    setItems((current) => current.map((tool, toolIndex) => toolIndex === index ? { ...tool, policy } : tool));
  }

  function updateEnabled(index: number, enabled: boolean) {
    setItems((current) => current.map((tool, toolIndex) => toolIndex === index ? { ...tool, enabled } : tool));
  }

  function updateContext(index: number, field: ContextField, value: string) {
    setItems((current) => current.map((tool, toolIndex) => {
      if (toolIndex !== index) return tool;
      const profile: AstrailToolProfile = {
        ...(tool.x_astrail ?? {
          risk: "write",
          requires_auth: false,
          auth_schemes: [],
          required_scopes: [],
          prerequisites: [],
          agent_instructions: [],
          example_arguments: {},
        }),
        [field]: value || undefined,
      };
      return { ...tool, x_astrail: profile };
    }));
  }

  function applyRecommendations() {
    setItems((current) => current.map(applyToolGovernanceRecommendation));
    setMessage("Recommended exposure and approval controls applied. Review them, then save.");
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools_json: items,
          business_context: businessContext.trim() || null,
        }),
      });
      const result = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? "Could not save tool metadata.");
      setMessage("Tool metadata saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save tool metadata.");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No editable tools for this server.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="border bg-neutral-50 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="font-medium">Production tool curation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.filter((tool) => tool.enabled !== false).length} exposed · {items.filter((tool) => tool.enabled === false).length} hidden · {items.filter((tool) => tool.policy === "approval").length} approval-gated
            </p>
          </div>
          <Button type="button" variant="outline" onClick={applyRecommendations}>
            <ShieldCheck className="h-4 w-4" />
            Apply safe defaults
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="server-business-context">Shared business context</Label>
          <Textarea
            id="server-business-context"
            value={businessContext}
            onChange={(event) => setBusinessContext(event.target.value)}
            maxLength={4000}
            className="min-h-24 bg-white"
            placeholder="Explain the customer, workflow, terminology, and non-negotiable rules every tool should understand."
          />
          <p className="text-xs text-muted-foreground">Included in MCP initialization instructions. Never paste credentials or private customer data here.</p>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((tool, index) => {
          const assessment = assessToolGovernance(tool);
          return (
          <div key={`${tool.name}-${index}`} className={`border bg-background p-4 ${tool.enabled === false ? "opacity-70" : ""}`}>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <code className="text-sm font-medium">{tool.name}</code>
                <p className="mt-1 text-xs text-muted-foreground">{assessment.actionLevel} action · risk {assessment.riskScore}/100 · recommended {assessment.recommendedEnabled ? assessment.recommendedPolicy : "hidden"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tool.enabled !== false} onChange={(event) => updateEnabled(index, event.target.checked)} />
                  {tool.enabled !== false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  Expose to agents
                </label>
                <select
                  aria-label={`Policy for ${tool.name}`}
                  value={tool.policy ?? assessment.recommendedPolicy}
                  onChange={(event) => updatePolicy(index, event.target.value as McpToolPolicy)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="allow">Allow</option>
                  <option value="approval">Require approval</option>
                  <option value="block">Block</option>
                </select>
              </div>
            </div>
            <p className="mt-3 border-l-2 border-neutral-300 pl-3 text-xs leading-5 text-muted-foreground">{assessment.reasons.join(" ")}</p>
            <Label className="mt-4 block" htmlFor={`tool-description-${index}`}>Agent-facing description</Label>
            <Textarea
              id={`tool-description-${index}`}
              value={tool.description}
              onChange={(event) => updateDescription(index, event.target.value)}
              maxLength={4000}
              className="mt-2 min-h-20"
            />
            <details className="mt-3 border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium">Business context and edge cases</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2"><Label htmlFor={`tool-business-context-${index}`}>Tool-specific business context</Label><Textarea id={`tool-business-context-${index}`} value={tool.x_astrail?.business_context ?? ""} onChange={(event) => updateContext(index, "business_context", event.target.value)} maxLength={1200} placeholder="What business object or workflow does this tool represent?" /></div>
                <div className="space-y-1"><Label htmlFor={`tool-use-when-${index}`}>Use when</Label><Input id={`tool-use-when-${index}`} value={tool.x_astrail?.use_when ?? ""} onChange={(event) => updateContext(index, "use_when", event.target.value)} maxLength={600} placeholder="The agent should choose this tool when..." /></div>
                <div className="space-y-1"><Label htmlFor={`tool-avoid-when-${index}`}>Do not use when</Label><Input id={`tool-avoid-when-${index}`} value={tool.x_astrail?.avoid_when ?? ""} onChange={(event) => updateContext(index, "avoid_when", event.target.value)} maxLength={600} placeholder="Use another tool or ask a human when..." /></div>
                <div className="space-y-1 md:col-span-2"><Label htmlFor={`tool-edge-cases-${index}`}>API edge cases</Label><Textarea id={`tool-edge-cases-${index}`} value={tool.x_astrail?.edge_case_notes ?? ""} onChange={(event) => updateContext(index, "edge_case_notes", event.target.value)} maxLength={1200} placeholder="Document provider quirks, required ordering, partial failures, or non-obvious response states." /></div>
              </div>
            </details>
          </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" onClick={save} disabled={saving}>
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save metadata"}
      </Button>
      {message && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}
      <p className="text-xs text-muted-foreground">
        Hidden tools are removed from tools/list and cannot be called by name. Policies run before upstream execution; approval calls pause with a one-time execution ID.
      </p>
    </div>
  );
}
