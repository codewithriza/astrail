import { NextResponse } from "next/server";
import { z } from "zod";
import { runGenerationPipeline } from "@/lib/generation-pipeline";
import { githubIssuesLaunchSpec } from "@/lib/launch-demos/github-issues";
import { createRawApiKey, hashApiKey, previewApiKey } from "@/lib/api-keys";
import { createTaskToken, hashTaskToken } from "@/lib/runtime/composable-authorization";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { getRuntimeBaseUrl } from "@/lib/urls";
import { POST as connectOAuth } from "@/app/api/oauth/connect/route";

export const runtime = "nodejs";
const Schema = z.object({
  end_user_id: z.string().trim().min(1).max(256),
  agent_id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/).default("github-issues-agent"),
  purpose: z.string().trim().min(3).max(500).default("Triage and respond to issues in the Astrail launch-demo repository"),
}).strict();

export async function POST(request: Request) {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ error: "GitHub reference setup requires workspace storage." }, { status: 503 });
  if (!process.env.GITHUB_TOOL_OAUTH_CLIENT_ID || !process.env.GITHUB_TOOL_OAUTH_CLIENT_SECRET) {
    return NextResponse.json({ error: "Set GITHUB_TOOL_OAUTH_CLIENT_ID and GITHUB_TOOL_OAUTH_CLIENT_SECRET for the GitHub tool OAuth app. These remain server-side." }, { status: 503 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid GitHub reference setup.", details: parsed.error.flatten() }, { status: 400 });
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const pipeline = await runGenerationPipeline({ sourceType: "json_paste", rawJson: githubIssuesLaunchSpec, generationMode: "static", clientPreset: "openai" });
  const admin = createAdminClient();
  await admin.from("profiles").upsert({ id: auth.user.id, email: auth.user.email ?? "" });
  const { data: server, error: serverError } = await admin.from("mcp_servers").insert({
    user_id: auth.user.id, name: "GitHub Issues Reference Integration", description: pipeline.generated.description,
    source_type: "json_paste", generated_code: pipeline.generated.generated_code, tools_json: pipeline.generated.tools,
    endpoint_map: pipeline.endpointMap, runtime_policy: { allowed_resources: ["Issue operations"], allowed_actions: ["read", "write", "send"] },
    diagnostics: pipeline.diagnostics, status: "live", validation_status: "passed", generation_status: "completed",
    is_public: false, hosted_endpoint: `${getRuntimeBaseUrl(new URL(request.url))}/api/mcp/pending`, call_count: 0,
  }).select("id,name,hosted_endpoint").single();
  if (serverError || !server) return NextResponse.json({ error: serverError?.message ?? "Could not create GitHub server." }, { status: 500 });
  const endpoint = `${getRuntimeBaseUrl(new URL(request.url))}/api/mcp/${server.id}`;
  await admin.from("mcp_servers").update({ hosted_endpoint: endpoint }).eq("id", server.id).eq("user_id", auth.user.id);
  const rawApiKey = createRawApiKey();
  const agentPolicy = { allowed_tools: pipeline.generated.tools.filter((tool) => tool.enabled !== false).map((tool) => tool.name), allowed_actions: ["read", "write", "send"], allowed_resources: ["Issue operations"], allowed_scopes: ["public_repo"] };
  const { data: apiKey, error: keyError } = await admin.from("api_keys").insert({ user_id: auth.user.id, name: `GitHub reference ${parsed.data.agent_id}`, key_hash: hashApiKey(rawApiKey), key_preview: previewApiKey(rawApiKey), end_user_id: parsed.data.end_user_id, actor_role: "operator", agent_id: parsed.data.agent_id, agent_policy: agentPolicy }).select("id,key_preview,agent_id").single();
  if (keyError || !apiKey) return NextResponse.json({ error: keyError?.message ?? "Could not bind trusted agent." }, { status: 500 });
  const rawTaskToken = createTaskToken(), expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data: task, error: taskError } = await admin.from("task_authorizations").insert({ user_id: auth.user.id, server_id: server.id, agent_id: parsed.data.agent_id, token_hash: hashTaskToken(rawTaskToken), nonce: crypto.randomUUID(), issuer: "github-reference-setup", purpose: parsed.data.purpose, allowed_tools: agentPolicy.allowed_tools, allowed_actions: agentPolicy.allowed_actions, approval_actions: ["write", "send"], allowed_resources: agentPolicy.allowed_resources, allowed_scopes: agentPolicy.allowed_scopes, expires_at: expiresAt }).select("id,purpose,expires_at").single();
  if (taskError || !task) return NextResponse.json({ error: taskError?.message ?? "Could not create task authorization." }, { status: 500 });
  const connectRequest = new Request(new URL("/api/oauth/connect", request.url), { method: "POST", headers: { cookie: request.headers.get("cookie") ?? "", "content-type": "application/json" }, body: JSON.stringify({ name: "GitHub per-user grant", server_id: server.id, provider: "github", security_scheme: "githubOAuth", client_id: process.env.GITHUB_TOOL_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_TOOL_OAUTH_CLIENT_SECRET, token_auth_method: "client_secret_post", scopes: ["public_repo"], end_user_id: parsed.data.end_user_id }) });
  const oauthResponse = await connectOAuth(connectRequest);
  const oauth = await oauthResponse.json();
  if (!oauthResponse.ok) {
    await admin.from("api_keys").delete().eq("id", apiKey.id).eq("user_id", auth.user.id);
    await admin.from("mcp_servers").delete().eq("id", server.id).eq("user_id", auth.user.id);
    return NextResponse.json({ error: oauth.error ?? "GitHub consent could not start; setup changes were rolled back." }, { status: oauthResponse.status });
  }
  return NextResponse.json({
    server: { ...server, hosted_endpoint: endpoint }, api_key: apiKey, raw_api_key: rawApiKey,
    task_authorization: task, raw_task_token: rawTaskToken, authorize_url: oauth.authorize_url,
    scopes: ["public_repo"], approval_actions: ["write", "send"],
    note: "API key and task token are displayed once. Open authorize_url to complete GitHub consent; provider secrets never leave Astrail.",
  }, { status: 201 });
}
