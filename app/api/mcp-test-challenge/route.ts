import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const TestChallengeSchema = z.object({
  turnstileToken: z.string().nullish(),
});

export async function POST(request: Request) {
  try {
    const body = TestChallengeSchema.parse(await request.json());
    const turnstileError = await requireTurnstile(request, body.turnstileToken, "mcp-endpoint-test");
    if (turnstileError) return turnstileError;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not verify challenge." }, { status: 400 });
  }
}
