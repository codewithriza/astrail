import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasCredentialEncryptionKey } from "@/lib/credentials";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { refreshExpiringXeroTokens } from "@/lib/xero-token-refresh";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return [process.env.ASTRAIL_XERO_REFRESH_SECRET, process.env.CRON_SECRET].some((expected) =>
    Boolean(expected && supplied.length === expected.length
      && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasServerNeonEnv() || !hasCredentialEncryptionKey()) {
    return NextResponse.json({ error: "Xero token refresh is not configured." }, { status: 503 });
  }
  try {
    return NextResponse.json(await refreshExpiringXeroTokens());
  } catch {
    return NextResponse.json({ error: "Xero token refresh failed." }, { status: 500 });
  }
}
