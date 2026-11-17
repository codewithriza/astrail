import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuditExportManifest } from "@/lib/audit-integrity";
import { createServerNeonClient } from "@/lib/neon/server";
const Schema = z.object({ rows: z.array(z.unknown()).max(5000), manifest: z.record(z.string(), z.unknown()), signature: z.string().regex(/^[a-f0-9]{64}$/).nullable() }).strict();
export async function POST(request: Request) {
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.manifest.user_id !== auth.user.id) return NextResponse.json({ error: "Invalid audit export." }, { status: 400 });
  return NextResponse.json(verifyAuditExportManifest(parsed.data.rows, parsed.data.manifest, parsed.data.signature));
}
