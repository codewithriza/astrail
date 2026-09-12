import { NextResponse } from "next/server";
import { z } from "zod";
import { previewSpec } from "@/lib/generation-pipeline";
import { previewRemoteMcpServer } from "@/lib/mcp-proxy";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createServerNeonClient } from "@/lib/neon/server";
import { requireTurnstile } from "@/lib/turnstile";
import { clientIp, hashIp } from "@/lib/security";
import { checkRuntimeRateLimit } from "@/lib/runtime/rate-limit";

export const runtime = "nodejs";

const PreviewRequestSchema = z.object({
  sourceType: z.enum(["url", "openapi_url", "json_paste", "graphql_url", "graphql_sdl", "mcp_url"]),
  sourceUrl: z.string().url().optional(),
  rawJson: z.string().optional(),
  mcpAuth: z.object({
    scheme: z.enum(["bearer", "api_key_header", "api_key_query"]),
    secret: z.string().min(8).max(8192),
    injectionName: z.string().min(1).max(80).optional(),
  }).strict().optional(),
  turnstileToken: z.string().nullish(),
  filters: z.object({
    tools: z.array(z.string()).optional(),
    noTools: z.array(z.string()).optional(),
    resources: z.array(z.string()).optional(),
    noResources: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    noTags: z.array(z.string()).optional(),
    operations: z.array(z.enum(["read", "write", "destructive"])).optional(),
    noOperations: z.array(z.enum(["read", "write", "destructive"])).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  if (!hasServerNeonEnv()) {
    try {
      const body = PreviewRequestSchema.parse(await request.json());
      const turnstileError = await requireTurnstile(request, body.turnstileToken, "mcp-generate");
      if (turnstileError) return turnstileError;
      const { turnstileToken: _turnstileToken, ...previewBody } = body;
      const preview = previewBody.sourceType === "mcp_url"
        ? await previewRemoteMcpServer(previewBody.sourceUrl ?? "", previewBody.mcpAuth)
        : await previewSpec(previewBody);
      return NextResponse.json({ preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not inspect spec.";
      const diagnostics = typeof error === "object" && error && "diagnostics" in error
        ? (error.diagnostics as string[])
        : undefined;
      return NextResponse.json({ error: message, diagnostics }, { status: 400 });
    }
  }

  const neon = await createServerNeonClient();
  const { data: userData, error: userError } = await neon.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const configuredLimit = Number(process.env.ASTRAIL_SPEC_PREVIEW_RATE_LIMIT_MAX ?? 20);
  const previewLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 20;
  const rateLimit = checkRuntimeRateLimit(`spec-preview:${userData.user.id}:${hashIp(clientIp(request))}`, previewLimit);
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
    return NextResponse.json({
      error: "Spec preview rate limit exceeded. Retry shortly.",
      code: "spec_preview_rate_limited",
    }, {
      status: 429,
      headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
    });
  }

  try {
    const body = PreviewRequestSchema.parse(await request.json());
    const { turnstileToken: _turnstileToken, ...previewBody } = body;
    const preview = previewBody.sourceType === "mcp_url"
      ? await previewRemoteMcpServer(previewBody.sourceUrl ?? "", previewBody.mcpAuth)
      : await previewSpec(previewBody);
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inspect spec.";
    const diagnostics = typeof error === "object" && error && "diagnostics" in error
      ? (error.diagnostics as string[])
      : undefined;
    return NextResponse.json({ error: message, diagnostics }, { status: 400 });
  }
}
