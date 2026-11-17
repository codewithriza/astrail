import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, hashIp, originAllowed, rateLimit } from "@/lib/security";
import { createNeonAdmin, getWaitlistTable, isNeonConfigured } from "@/lib/waitlist";

export const runtime = "nodejs";

const WaitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().trim().max(80).optional().default("site"),
  website: z.string().max(0).optional().or(z.literal("")),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isDuplicateEmail(error: { code?: string; message?: string; details?: string }) {
  const text = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return error.code === "23505" || (text.includes("duplicate") && text.includes("email"));
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return json({ ok: false, error: "Request origin is not allowed." }, 403);
  }

  const ip = clientIp(request);
  const ipHash = hashIp(ip);
  const limited = rateLimit(ipHash);
  if (!limited.allowed) {
    return json({ ok: false, error: "Too many attempts. Try again later." }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const parsed = WaitlistSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "Enter a valid email address." }, 400);
  }

  if (parsed.data.website) {
    return json({ ok: true });
  }

  if (!isNeonConfigured()) {
    return json({ ok: false, error: "Waitlist is not configured yet." }, 503);
  }

  const neon = createNeonAdmin();
  const table = getWaitlistTable();
  const { error } = await neon.from(table).insert({
    email: parsed.data.email,
  });

  if (error) {
    if (isDuplicateEmail(error)) {
      return json({ ok: true });
    }

    console.error("waitlist_insert_failed", {
      table,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return json({ ok: false, error: "Could not join the waitlist yet." }, 500);
  }

  return json({ ok: true });
}
