import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptCredential, hasCredentialEncryptionKey, previewSecret } from "@/lib/credentials";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { createAdminClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";

const Body = z.object({ secret: z.string().min(8).max(8192) });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const parsed = Body.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "A replacement secret of at least 8 characters is required." }, { status: 400 });
  if (!hasServerNeonEnv()) return NextResponse.json({ rotated: true, key_preview: previewSecret(parsed.data.secret), preview: true });
  if (!hasCredentialEncryptionKey()) return NextResponse.json({ error: "Credential storage requires CREDENTIAL_ENCRYPTION_KEY." }, { status: 503 });
  const user = await getDashboardSessionUser(); const { id } = await props.params; const db = createAdminClient();
  const { data: credential } = await db.from("api_credentials").select("id,auth_scheme").eq("id", id).eq("user_id", user.id).maybeSingle(); if (!credential) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  if (credential.auth_scheme === "oauth2") return NextResponse.json({ error: "OAuth connections must be reconnected through the provider flow." }, { status: 400 });
  const encrypted = encryptCredential(parsed.data.secret); const { error } = await db.from("api_credentials").update({ secret_ciphertext: encrypted, key_preview: previewSecret(parsed.data.secret), connect_status: "connected", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rotated: true, key_preview: previewSecret(parsed.data.secret) });
}
