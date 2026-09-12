import { NextResponse } from "next/server";
import { z } from "zod";
import { createRawApiKey, hashApiKey, previewApiKey } from "@/lib/api-keys";
import { localDemoApiKeys, localDemoUserId } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createDataClient, createServerNeonClient } from "@/lib/neon/server";
import type { ApiKey } from "@/lib/types";

export const runtime = "nodejs";

const CreateKeySchema = z.object({
  name: z.string().min(1).max(80),
  end_user_id: z.string().trim().min(1).max(256).optional(),
  actor_role: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
  agent_id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
  agent_policy: z.object({
    allowed_tools: z.array(z.string().min(1).max(240)).max(200).optional(),
    allowed_actions: z.array(z.enum(["read", "draft", "write", "send", "destructive"])).max(5).optional(),
    allowed_resources: z.array(z.string().min(1).max(240)).max(200).optional(),
    allowed_scopes: z.array(z.string().min(1).max(240)).max(200).optional(),
  }).strict().default({}),
}).strict();

const DeleteKeySchema = z.object({
  id: z.string().uuid(),
  confirmation: z.string().min(1),
});

export async function GET() {
  if (!hasServerNeonEnv()) {
    return NextResponse.json({ keys: localDemoApiKeys() });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const db = await createDataClient();
  const { data, error } = await db
    .from("api_keys")
    .select("id,user_id,name,key_preview,end_user_id,actor_role,agent_id,agent_policy,last_used,created_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: (data ?? []) as ApiKey[] });
}

export async function POST(request: Request) {
  const parsed = CreateKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid API key scope.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (!hasServerNeonEnv()) {
    const rawKey = `ag_demo_${Math.random().toString(36).slice(2, 18)}`;
    return NextResponse.json({
      key: {
        id: "00000000-0000-4000-8000-000000000002",
        user_id: localDemoUserId,
        name: body.name.trim(),
        key_preview: previewApiKey(rawKey),
        end_user_id: body.end_user_id ?? null,
        actor_role: body.actor_role ?? null,
        agent_id: body.agent_id ?? null,
        agent_policy: body.agent_policy,
        last_used: null,
        created_at: new Date().toISOString(),
      } satisfies ApiKey,
      rawKey,
    });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const keyName = body.name.trim();
  const rawKey = createRawApiKey();
  const db = await createDataClient();

  const { data: existing, error: existingError } = await db
    .from("api_keys")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("name", keyName)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ error: "An API key with this name already exists." }, { status: 409 });
  }

  const { data, error } = await db
    .from("api_keys")
    .insert({
      user_id: userData.user.id,
      name: keyName,
      key_hash: hashApiKey(rawKey),
      key_preview: previewApiKey(rawKey),
      end_user_id: body.end_user_id ?? null,
      actor_role: body.actor_role ?? null,
      agent_id: body.agent_id ?? null,
      agent_policy: body.agent_policy,
    })
    .select("id,user_id,name,key_preview,end_user_id,actor_role,agent_id,agent_policy,last_used,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ key: data as ApiKey, rawKey });
}

export async function DELETE(request: Request) {
  const parsed = DeleteKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid API key deletion request.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (!hasServerNeonEnv()) {
    return NextResponse.json({ deleted: true });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const db = await createDataClient();

  const { data: key, error: keyError } = await db
    .from("api_keys")
    .select("id,name")
    .eq("id", body.id)
    .eq("user_id", userData.user.id)
    .single();

  if (keyError || !key) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  if (body.confirmation !== key.name) {
    return NextResponse.json({ error: `Type ${JSON.stringify(key.name)} to delete this key.` }, { status: 400 });
  }

  const { error } = await db
    .from("api_keys")
    .delete()
    .eq("id", body.id)
    .eq("user_id", userData.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
