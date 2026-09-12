import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPinnedPublicDispatcher, readBoundedResponseText } from "@/lib/runtime/network-policy";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = IdSchema.safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "Invalid verification ID." }, { status: 400 });
  const user = (await (await createServerNeonClient()).auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasServiceRoleKey()) return NextResponse.json({ error: "x402 verification storage is unavailable." }, { status: 503 });
  const admin = createAdminClient();
  const { data: verification } = await admin.from("x402_domain_verifications")
    .select("id,server_id,user_id,domain,token_hash,status")
    .eq("id", id.data).eq("user_id", user.id).maybeSingle();
  if (!verification) return NextResponse.json({ error: "Domain challenge not found." }, { status: 404 });
  const url = new URL(`https://${verification.domain}/.well-known/astrail-domain-verification.txt`);
  let dispatcher: Awaited<ReturnType<typeof createPinnedPublicDispatcher>> | null = null;
  try {
    dispatcher = await createPinnedPublicDispatcher(url);
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "text/plain" },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
      dispatcher,
    } as RequestInit & { dispatcher: typeof dispatcher });
    if (!response.ok) throw new Error(`Challenge returned HTTP ${response.status}.`);
    const text = (await readBoundedResponseText(response, 4_096, "Domain challenge response")).trim();
    const matches = createHash("sha256").update(text).digest("hex") === verification.token_hash;
    if (!matches) throw new Error("Challenge value does not match.");
    const now = new Date().toISOString();
    await admin.from("x402_domain_verifications").update({ status: "verified", verified_at: now, last_error: null, updated_at: now }).eq("id", id.data).eq("user_id", user.id);
    return NextResponse.json({ verified: true, domain: verification.domain, verified_at: now });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Domain verification failed.";
    await admin.from("x402_domain_verifications").update({ status: "failed", last_error: message, updated_at: new Date().toISOString() }).eq("id", id.data).eq("user_id", user.id);
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await dispatcher?.close().catch(() => undefined);
  }
}
