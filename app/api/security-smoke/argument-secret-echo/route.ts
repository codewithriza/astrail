import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    headers: {
      "X-Echo-Value": request.headers.get("x-echo-value") ?? "",
    },
  });
}
