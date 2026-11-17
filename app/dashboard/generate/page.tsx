"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Braces, Check, FileJson, Globe2, Loader2, Server, ShieldCheck, Upload, type LucideIcon } from "lucide-react";
import { TurnstileChallenge } from "@/components/TurnstileChallenge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readJsonResponse } from "@/lib/client-json";
import { githubIssuesLaunchSpec } from "@/lib/launch-demos/github-issues";
import { cn } from "@/lib/utils";
import type { GenerationDiagnostics, RuntimePermissionPolicy, SpecPreview } from "@/lib/types";

const openApiLoadingSteps = ["Discovering API contract", "Validating endpoints", "Generating MCP tools"];
const websiteLoadingSteps = ["Inspecting public website", "Generating browser MCP tools", "Saving hosted MCP endpoint"];
const mcpLoadingSteps = ["Inspecting MCP tools", "Creating proxy endpoint", "Saving hosted MCP endpoint"];
const graphqlLoadingSteps = ["Introspecting GraphQL schema", "Compiling typed operations", "Saving hosted MCP endpoint"];

type SourceMode = "url" | "json_paste" | "graphql_url" | "graphql_sdl" | "mcp_url";

const jsonPlaceholderSpec = JSON.stringify(
  {
    openapi: "3.0.0",
    info: {
      title: "JSONPlaceholder API",
      version: "1.0.0",
      description: "REST API for posts, comments, users, and todos.",
    },
    servers: [{ url: "https://jsonplaceholder.typicode.com" }],
    paths: {
      "/posts": {
        get: { summary: "List posts", operationId: "listPosts", responses: { "200": { description: "Posts" } } },
        post: { summary: "Create post", operationId: "createPost", responses: { "201": { description: "Created post" } } },
      },
      "/posts/{id}": {
        get: {
          summary: "Get post",
          operationId: "getPost",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Post" } },
        },
        delete: {
          summary: "Delete post",
          operationId: "deletePost",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Deleted" } },
        },
      },
      "/users": {
        get: { summary: "List users", operationId: "listUsers", responses: { "200": { description: "Users" } } },
      },
      "/todos": {
        get: { summary: "List todos", operationId: "listTodos", responses: { "200": { description: "Todos" } } },
      },
    },
  },
  null,
  2
);

const graphqlIntrospectionSpec = JSON.stringify(
  {
    endpoint: "https://graphql.example.com/graphql",
    title: "Example GraphQL API",
    data: {
      __schema: {
        queryType: { name: "Query" },
        types: [
          {
            kind: "OBJECT",
            name: "Query",
            fields: [
              {
                name: "user",
                description: "Fetch a user by ID.",
                args: [{ name: "id", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } } }],
                type: { kind: "OBJECT", name: "User" },
              },
            ],
          },
          {
            kind: "OBJECT",
            name: "User",
            fields: [
              { name: "id", args: [], type: { kind: "SCALAR", name: "ID" } },
              { name: "name", args: [], type: { kind: "SCALAR", name: "String" } },
            ],
          },
          { kind: "SCALAR", name: "ID" },
          { kind: "SCALAR", name: "String" },
        ],
      },
    },
  },
  null,
  2
);

const presets = [
  {
    label: "GitHub Issues production demo",
    sourceType: "json_paste" as const,
    value: githubIssuesLaunchSpec,
  },
  {
    label: "Petstore",
    sourceType: "url" as const,
    value: "https://petstore.swagger.io/v2/swagger.json",
  },
  {
    label: "Petstore Swagger UI",
    sourceType: "url" as const,
    value: "https://petstore.swagger.io/",
  },
  {
    label: "Google Calendar Discovery",
    sourceType: "url" as const,
    value: "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
  },
  {
    label: "JSONPlaceholder",
    sourceType: "json_paste" as const,
    value: jsonPlaceholderSpec,
  },
  {
    label: "GraphQL introspection",
    sourceType: "json_paste" as const,
    value: graphqlIntrospectionSpec,
  },
];

const sourceOptions: Array<{ id: SourceMode; label: string; icon: LucideIcon; detail: string }> = [
  { id: "url", label: "URL", icon: Globe2, detail: "Docs, OpenAPI, Swagger, Google Discovery" },
  { id: "json_paste", label: "JSON/YAML", icon: FileJson, detail: "OpenAPI, Swagger, Discovery, GraphQL introspection" },
  { id: "graphql_url", label: "GraphQL URL", icon: Braces, detail: "Live schema introspection and typed operations" },
  { id: "graphql_sdl", label: "GraphQL SDL", icon: Braces, detail: "Schema text plus its execution endpoint" },
  { id: "mcp_url", label: "MCP endpoint", icon: Server, detail: "Proxy an existing HTTP MCP server" },
];

type SafetyPresetId = "guarded" | "read_only" | "open";

const safetyPresets: Array<{
  id: SafetyPresetId;
  label: string;
  detail: string;
  policy?: RuntimePermissionPolicy;
}> = [
  {
    id: "guarded",
    label: "Guarded",
    detail: "Blocks destructive calls",
    policy: {
      allow_http_gets: true,
      blocked_methods: [
        { match: "http_method", pattern: "DELETE" },
        { match: "operation_id", pattern: "delete|remove|destroy|purge|erase|void|refund", regex: true },
        { match: "tool_name", pattern: "delete|remove|destroy|purge|erase|void|refund", regex: true },
      ],
    },
  },
  {
    id: "read_only",
    label: "Read-only",
    detail: "Only safe reads",
    policy: {
      allow_http_gets: true,
      read_only: true,
    },
  },
  {
    id: "open",
    label: "Open",
    detail: "No tool blocks",
  },
];

function diagnosticsToLines(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (!value || typeof value !== "object") return [];

  const diagnostics = value as Partial<GenerationDiagnostics>;
  return [
    ...(diagnostics.errors ?? []).map((item) => `Error: ${item}`),
    ...(diagnostics.warnings ?? []).map((item) => `Warning: ${item}`),
    ...(diagnostics.raw ?? []),
  ];
}

function isNoOpenApiError(message: string) {
  return message.includes("No OpenAPI/Swagger") || message.includes("No OpenAPI spec found");
}

export default function GeneratePage() {
  const router = useRouter();
  const [backDestination, setBackDestination] = useState({ href: "/dashboard/integrations", label: "Back to integrations" });
  const [mode, setMode] = useState<SourceMode>("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeLoadingSteps, setActiveLoadingSteps] = useState(openApiLoadingSteps);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [websiteFallbackUrl, setWebsiteFallbackUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<SpecPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("All");
  const [generationMode, setGenerationMode] = useState<"auto" | "static" | "dynamic" | "code">("auto");
  const [clientPreset, setClientPreset] = useState<"default" | "claude" | "claude-code" | "cursor" | "openai">("default");
  const [safetyPreset, setSafetyPreset] = useState<SafetyPresetId>("guarded");
  const [fileName, setFileName] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [mcpAuthEnabled, setMcpAuthEnabled] = useState(false);
  const [mcpAuthScheme, setMcpAuthScheme] = useState<"bearer" | "api_key_header" | "api_key_query">("bearer");
  const [mcpAuthSecret, setMcpAuthSecret] = useState("");
  const [mcpAuthInjectionName, setMcpAuthInjectionName] = useState("");
  const challengeEnabled = Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY);
  const challengeReady = !challengeEnabled || Boolean(turnstileToken);

  function resetTurnstile() {
    setTurnstileToken(null);
    setTurnstileResetSignal((current) => current + 1);
  }

  function clearPreviousRun() {
    setError(null);
    setDiagnostics([]);
    setPreview(null);
    setWebsiteFallbackUrl(null);
    setSelectedGroup("All");
  }

  async function loadSpecFile(file: File | null) {
    if (!file) return;
    clearPreviousRun();
    setMode("json_paste");
    setFileName(file.name);
    try {
      setRawJson(await file.text());
    } catch {
      setError("Could not read that API contract file.");
      setFileName(null);
    }
  }

  useEffect(() => {
    const fromOnboarding = new URLSearchParams(window.location.search).get("onboarding") === "1";
    if (fromOnboarding) {
      setBackDestination({ href: "/dashboard/onboarding", label: "Back to app selection" });
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, activeLoadingSteps.length - 1));
    }, 1800);
    return () => clearInterval(interval);
  }, [activeLoadingSteps.length, loading]);

  function requestPayload() {
    return {
      sourceType: mode,
      sourceUrl: mode === "url" || mode === "graphql_url" || mode === "graphql_sdl" || mode === "mcp_url" ? sourceUrl : undefined,
      rawJson: mode === "json_paste" || mode === "graphql_sdl" ? rawJson : undefined,
      mcpAuth: mode === "mcp_url" && mcpAuthEnabled ? {
        scheme: mcpAuthScheme,
        secret: mcpAuthSecret,
        injectionName: mcpAuthScheme === "bearer" ? undefined : mcpAuthInjectionName || undefined,
      } : undefined,
    };
  }

  function runtimePolicyForPreset() {
    return safetyPresets.find((preset) => preset.id === safetyPreset)?.policy;
  }

  async function inspectSpec(): Promise<SpecPreview | "website_fallback" | null> {
    setError(null);
    setDiagnostics([]);
    setWebsiteFallbackUrl(null);
    setPreviewLoading(true);

    try {
      const response = await fetch("/api/spec-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestPayload(), turnstileToken }),
      });
      const result = await readJsonResponse<{ preview?: SpecPreview; error?: string; diagnostics?: string[] }>(response);
      if (!response.ok || !result.preview) {
        setDiagnostics(result.diagnostics ?? []);
        throw new Error(result.error ?? "Could not inspect spec.");
      }

      setPreview(result.preview);
      setDiagnostics(result.preview.diagnostics);
      setSelectedGroup(result.preview.groups[0]?.name ?? "All");
      setGenerationMode(result.preview.recommended_mode ?? "auto");
      return result.preview;
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Could not inspect spec.";
      setError(message);
      if (mode === "url" && sourceUrl && isNoOpenApiError(message)) {
        setWebsiteFallbackUrl(sourceUrl);
        return "website_fallback";
      }
      return null;
    } finally {
      setPreviewLoading(false);
    }
  }

  async function generateWebsiteMcp(targetUrl = sourceUrl) {
    setError(null);
    setDiagnostics([]);
    setLoading(true);
    setActiveLoadingSteps(websiteLoadingSteps);
    setStepIndex(0);

    try {
      const response = await fetch("/api/website-to-mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, turnstileToken }),
      });
      const result = await readJsonResponse<{ server?: { id: string }; error?: string }>(response);
      if (!response.ok || !result.server?.id) {
        throw new Error(result.error ?? "Website-to-MCP generation failed.");
      }

      router.push(`/dashboard/servers/${result.server.id}`);
      router.refresh();
    } catch (websiteError) {
      setError(websiteError instanceof Error ? websiteError.message : "Website-to-MCP generation failed.");
      setWebsiteFallbackUrl(targetUrl);
      setLoading(false);
    } finally {
      resetTurnstile();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDiagnostics([]);

    if (!preview) {
      const inspected = await inspectSpec();
      if (inspected === "website_fallback") {
        await generateWebsiteMcp();
        return;
      }
      if (!inspected) {
        return;
      }
    }

    setLoading(true);
    setActiveLoadingSteps(mode === "mcp_url" ? mcpLoadingSteps : mode.startsWith("graphql_") ? graphqlLoadingSteps : openApiLoadingSteps);
    setStepIndex(0);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ...requestPayload(),
          selectedGroup,
          endpointLimit: preview?.endpoint_limit ?? 30,
          generationMode,
          clientPreset,
          runtimePolicy: runtimePolicyForPreset(),
          turnstileToken,
        }),
      });
      clearTimeout(timeoutId);

      const result = await readJsonResponse<{ server?: { id: string }; error?: string; diagnostics?: unknown }>(response);
      if (!response.ok || !result.server) {
        setDiagnostics(diagnosticsToLines(result.diagnostics));
        throw new Error(result.error ?? "Generation failed.");
      }

      router.push(`/dashboard/servers/${result.server.id}`);
      router.refresh();
    } catch (generateError) {
      clearTimeout(timeoutId);
      if (generateError instanceof Error && generateError.name === "AbortError") {
        setError("Generation timed out. Try a smaller spec, paste JSON directly, or retry in a moment.");
      } else {
        setError(generateError instanceof Error ? generateError.message : "Generation failed.");
      }
      setLoading(false);
    } finally {
      resetTurnstile();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center overflow-x-hidden overflow-y-auto bg-[#f8f6f1] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex w-full max-w-6xl items-end justify-between gap-5">
        <div>
          <a href={backDestination.href} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> {backDestination.label}</a>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-950">Connect a custom API</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">Give Astrail a documentation URL or API contract. We’ll inspect it before creating any tools.</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-neutral-500 sm:flex"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Guarded by default</div>
      </div>

      <div className="w-full max-w-6xl">
        <form onSubmit={onSubmit} className="grid min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white xl:max-h-[calc(100dvh-190px)] xl:min-h-[590px] xl:grid-cols-2 xl:overflow-y-auto">
          <section className="min-w-0 overflow-hidden border-b border-neutral-100 p-4 sm:p-5 xl:col-span-2">
            <div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>What do you have?</Label>
                  </div>
                  <span className="hidden text-xs text-neutral-400 sm:inline">Astrail detects OpenAPI, Swagger, GraphQL, and MCP</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {sourceOptions.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          clearPreviousRun();
                          setMode(item.id);
                        }}
                        className={cn(
                          "flex h-11 items-center gap-2 rounded-lg border px-3 text-left transition-colors active:translate-y-px",
                          mode === item.id
                            ? "border-orange-500 bg-orange-50 text-orange-900"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-950"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate text-xs font-semibold sm:text-sm">{item.label}</span>
                        {mode === item.id ? <Check className="ml-auto hidden h-3.5 w-3.5 sm:block" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1"><span className="shrink-0 text-xs text-neutral-400">Try an example:</span>{presets.slice(0, 5).map((preset) => <button key={preset.label} type="button" className="h-8 shrink-0 rounded-md bg-[#f5f2eb] px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200" onClick={() => { clearPreviousRun(); setMode(preset.sourceType); if (preset.sourceType === "url") setSourceUrl(preset.value); else setRawJson(preset.value); }}>{preset.label.replace(" production demo", "")}</button>)}</div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden border-b border-neutral-100 p-4 sm:p-5 xl:border-r">
            {mode !== "json_paste" && mode !== "graphql_sdl" ? (
              <div className="space-y-2">
                <Label htmlFor="sourceUrl">{mode === "mcp_url" ? "MCP HTTP endpoint URL" : mode === "graphql_url" ? "GraphQL endpoint URL" : "API docs, OpenAPI, Swagger, or Google Discovery URL"}</Label>
                <Input
                  id="sourceUrl"
                  type="url"
                  placeholder={mode === "mcp_url" ? "https://executor.example.com/mcp" : mode === "graphql_url" ? "https://api.example.com/graphql" : "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"}
                  value={sourceUrl}
                  onChange={(event) => {
                    clearPreviousRun();
                    setSourceUrl(event.target.value);
                  }}
                  required
                  className="h-12 min-w-0 rounded-lg border-neutral-300 bg-neutral-50 px-4 text-base"
                />
                {mode === "mcp_url" && (
                  <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={mcpAuthEnabled}
                        onChange={(event) => setMcpAuthEnabled(event.target.checked)}
                      />
                      This endpoint requires authentication
                    </label>
                    {mcpAuthEnabled && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="mcpAuthScheme">Credential type</Label>
                          <select
                            id="mcpAuthScheme"
                            value={mcpAuthScheme}
                            onChange={(event) => setMcpAuthScheme(event.target.value as typeof mcpAuthScheme)}
                            className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                          >
                            <option value="bearer">Bearer token</option>
                            <option value="api_key_header">API key header</option>
                            <option value="api_key_query">API key query</option>
                          </select>
                        </div>
                        {mcpAuthScheme !== "bearer" && (
                          <div className="space-y-1.5">
                            <Label htmlFor="mcpAuthName">{mcpAuthScheme === "api_key_header" ? "Header name" : "Query parameter"}</Label>
                            <Input
                              id="mcpAuthName"
                              value={mcpAuthInjectionName}
                              onChange={(event) => setMcpAuthInjectionName(event.target.value)}
                              placeholder={mcpAuthScheme === "api_key_header" ? "x-api-key" : "api_key"}
                            />
                          </div>
                        )}
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor="mcpAuthSecret">Secret</Label>
                          <Input
                            id="mcpAuthSecret"
                            type="password"
                            autoComplete="off"
                            value={mcpAuthSecret}
                            onChange={(event) => setMcpAuthSecret(event.target.value)}
                            minLength={8}
                            required
                            placeholder="Stored encrypted and never shown again"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {mode === "graphql_sdl" && (
                  <div className="space-y-2">
                    <Label htmlFor="sourceUrl">GraphQL execution endpoint URL</Label>
                    <Input
                      id="sourceUrl"
                      type="url"
                      placeholder="https://api.example.com/graphql"
                      value={sourceUrl}
                      onChange={(event) => {
                        clearPreviousRun();
                        setSourceUrl(event.target.value);
                      }}
                      required
                      className="h-14 rounded-lg border-neutral-300 bg-neutral-50 px-4 text-base"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="specFile">{mode === "graphql_sdl" ? "Upload GraphQL schema" : "Upload API contract"}</Label>
                  <label
                    htmlFor="specFile"
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{fileName ?? "Choose JSON or YAML file"}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">Browse</span>
                  </label>
                  <input
                    id="specFile"
                    type="file"
                    accept={mode === "graphql_sdl" ? ".graphql,.graphqls,.gql,text/plain" : ".json,.yaml,.yml,application/json,application/yaml,text/yaml,text/x-yaml"}
                    className="sr-only"
                    onChange={(event) => void loadSpecFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rawJson">{mode === "graphql_sdl" ? "GraphQL SDL" : "OpenAPI, Swagger, Google Discovery, or GraphQL introspection JSON/YAML"}</Label>
                  <Textarea
                    id="rawJson"
                    className="min-h-52 max-h-[280px] rounded-lg bg-neutral-50 font-mono"
                    placeholder={mode === "graphql_sdl" ? "type Query { user(id: ID!): User }\ntype User { id: ID!, name: String! }" : '{ "openapi": "3.0.0", "info": { "title": "Example API" }, "paths": {} }'}
                    value={rawJson}
                    onChange={(event) => {
                      clearPreviousRun();
                      setRawJson(event.target.value);
                    }}
                    required
                  />
                </div>
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-hidden border-b border-neutral-100 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold">{mode === "mcp_url" ? "Tool preview" : "Review before creating"}</p><p className="mt-1 text-xs text-neutral-500">Check what Astrail found and adjust advanced options only if needed.</p></div>
              <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" onClick={inspectSpec} disabled={previewLoading || loading || !challengeReady}>
                {previewLoading ? "Inspecting" : mode === "mcp_url" ? "Inspect tools" : "Inspect endpoints"}
              </Button>
            </div>

            {preview && (
              <div className="mt-5 space-y-5">
                {preview.warning && (
                  <p className="border border-primary/40 bg-background p-3 text-sm text-primary">
                    {preview.warning}
                  </p>
                )}
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <PreviewStat label={mode === "mcp_url" ? "Transport" : "Spec size"} value={mode === "mcp_url" ? "HTTP MCP" : `${preview.spec_size_bytes.toLocaleString()} bytes`} />
                  <PreviewStat label={mode === "mcp_url" ? "Tools found" : "Endpoints found"} value={String(preview.endpoint_count)} />
                  <PreviewStat label={mode === "mcp_url" ? "Tool limit" : "Endpoint limit"} value={String(preview.endpoint_limit)} />
                </div>
                {mode !== "mcp_url" && (
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
                    <div className="space-y-2">
                      <Label htmlFor="endpointGroup">Endpoint group</Label>
                      <select
                        id="endpointGroup"
                        value={selectedGroup}
                        onChange={(event) => setSelectedGroup(event.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
                      >
                        {preview.groups.map((group) => (
                          <option key={group.name} value={group.name}>
                            {group.name} ({Math.min(group.count, preview.endpoint_limit)} of {group.count})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="generationMode">Tool loading</Label>
                      <select
                        id="generationMode"
                        value={generationMode}
                        onChange={(event) => setGenerationMode(event.target.value as typeof generationMode)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
                      >
                        <option value="auto">Auto</option>
                        <option value="code">Code Mode</option>
                        <option value="static">Static tools</option>
                        <option value="dynamic">Dynamic catalog</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientPreset">MCP client</Label>
                      <select
                        id="clientPreset"
                        value={clientPreset}
                        onChange={(event) => setClientPreset(event.target.value as typeof clientPreset)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
                      >
                        <option value="default">Default</option>
                        <option value="claude">Claude Desktop</option>
                        <option value="claude-code">Claude Code</option>
                        <option value="cursor">Cursor</option>
                        <option value="openai">OpenAI Agents</option>
                      </select>
                    </div>
                  </div>
                )}
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <PreviewStat label="Resources" value={preview.resources?.slice(0, 4).map((item) => `${item.name} (${item.count})`).join(", ") || "None"} />
                  <PreviewStat label="Operations" value={preview.operations?.map((item) => `${item.name} (${item.count})`).join(", ") || "None"} />
                </div>
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-hidden border-b border-neutral-100 p-4 sm:p-5 xl:border-r">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-orange-200 bg-orange-50 text-orange-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">What should these tools be allowed to do?</p>
                <p className="text-xs text-muted-foreground">You can change this later</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {safetyPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSafetyPreset(preset.id)}
                  className={cn(
                    "min-h-[64px] rounded-lg border px-4 py-3 text-left transition-colors",
                    safetyPreset === preset.id
                      ? "border-orange-500 bg-orange-50 text-orange-950"
                      : "border-neutral-200 bg-white text-muted-foreground hover:border-neutral-300 hover:text-foreground"
                  )}
                >
                  <span className="block text-sm font-semibold">{preset.label}</span>
                  <span className="mt-1 block text-xs leading-5">{preset.detail}</span>
                </button>
              ))}
            </div>
          </section>

          {error && (
            <div className={cn("border bg-background p-4", websiteFallbackUrl ? "border-orange-300/50" : "border-destructive/40")}>
              <div className={cn("flex items-start gap-2 text-sm", websiteFallbackUrl ? "text-foreground" : "text-destructive")}>
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <p>{websiteFallbackUrl ? "This looks like a public website, not an API contract." : error}</p>
              </div>
              {websiteFallbackUrl && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" onClick={() => void generateWebsiteMcp(websiteFallbackUrl)} disabled={loading || !challengeReady}>
                      {loading ? "Generating Website to MCP" : "Generate Website to MCP instead"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.push("/dashboard/website-to-mcp")}>
                      Open Website to MCP
                    </Button>
                  </div>
                </div>
              )}
              {diagnostics.length > 0 && (
                <details className="mt-3 border-t pt-3">
                  <summary className="cursor-pointer text-sm font-medium">Discovery diagnostics</summary>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {diagnostics.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {loading && (
            <div className="mx-5 mt-5 flex items-center gap-2 rounded-lg border bg-orange-50 px-4 py-3 text-sm text-orange-800 sm:mx-6">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {activeLoadingSteps[stepIndex]}
            </div>
          )}

          <div className="bg-neutral-50 p-4 sm:p-5 xl:col-span-2 xl:sticky xl:bottom-0 xl:z-10 xl:flex xl:items-center xl:justify-between">
            <TurnstileChallenge
              action="mcp-generate"
              resetSignal={turnstileResetSignal}
              onToken={setTurnstileToken}
              className="mb-4 xl:mb-0"
            />
            <div className="flex items-center justify-end gap-4"><p className="hidden text-xs text-neutral-500 sm:block">Nothing is created until you continue.</p><Button type="submit" disabled={loading || !challengeReady} className="h-11 w-full min-w-[190px] rounded-lg bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 sm:w-auto">
              {loading ? "Creating tools…" : mode === "mcp_url" ? "Create MCP connection" : "Create API tools"} <ArrowRight className="h-4 w-4" />
            </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
