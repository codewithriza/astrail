import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptCredential, hasCredentialEncryptionKey, previewSecret } from "@/lib/credentials";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import { isSensitiveWebhookHeader } from "@/lib/webhook-security";

export const runtime = "nodejs";

const HeaderName = z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i);
const CreateWebhookSchema = z.object({
  server_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  signature_header: HeaderName.default("x-astrail-signature"),
  event_id_header: HeaderName.default("x-event-id"),
  provider: z.enum(["generic","github","slack","stripe"]).default("generic"),
}).strict().superRefine((value, context) => {
  const signature = value.signature_header.toLowerCase();
  const eventId = value.event_id_header.toLowerCase();
  if (signature === eventId) context.addIssue({ code: "custom", path: ["event_id_header"], message: "Signature and event-ID headers must be different." });
  if (isSensitiveWebhookHeader(signature)) context.addIssue({ code: "custom", path: ["signature_header"], message: "Sensitive credential headers cannot carry webhook signatures." });
  if (isSensitiveWebhookHeader(eventId)) context.addIssue({ code: "custom", path: ["event_id_header"], message: "Sensitive credential headers cannot be stored as event IDs." });
});

async function authenticatedUser() {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return null;
  const { data } = await (await createServerNeonClient()).auth.getUser();
  return data.user ?? null;
}

export async function GET(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const serverId = new URL(request.url).searchParams.get("server_id");
  if (!serverId) return NextResponse.json({ error: "server_id is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: endpoints, error } = await admin.from("webhook_endpoints")
    .select("id,server_id,name,provider,secret_preview,signature_header,event_id_header,is_active,created_at")
    .eq("user_id", user.id).eq("server_id", serverId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const endpointIds = (endpoints ?? []).map((endpoint) => endpoint.id);
  if (endpointIds.length === 0) return NextResponse.json({ endpoints: [], events: [] });
  const { data: events, error: eventsError } = await admin.from("webhook_events")
    .select("id,endpoint_id,event_id,event_type,status,received_at")
    .eq("user_id", user.id).in("endpoint_id", endpointIds)
    .order("received_at", { ascending: false }).limit(25);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  return NextResponse.json({ endpoints: endpoints ?? [], events: events ?? [] });
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasCredentialEncryptionKey()) return NextResponse.json({ error: "Webhook signing requires CREDENTIAL_ENCRYPTION_KEY." }, { status: 503 });
  const parsed = CreateWebhookSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook configuration.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();
  const { data: server } = await admin.from("mcp_servers")
    .select("id").eq("id", body.server_id).eq("user_id", user.id).maybeSingle();
  if (!server) return NextResponse.json({ error: "Integration not found." }, { status: 404 });

  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const { data, error } = await admin.from("webhook_endpoints").insert({
    user_id: user.id,
    server_id: body.server_id,
    name: body.name,
    secret_ciphertext: encryptCredential(secret),
    secret_preview: previewSecret(secret),
    signature_header: body.signature_header.toLowerCase(),
    event_id_header: body.event_id_header.toLowerCase(),
    provider: body.provider,
  }).select("id,server_id,name,provider,secret_preview,signature_header,event_id_header,is_active,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ endpoint: data, secret, ingest_path: `/api/webhooks/${data.id}` });
}
