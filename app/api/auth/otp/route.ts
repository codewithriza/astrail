import { NextResponse } from "next/server";
import { z } from "zod";
import { getNeonAuth } from "@/lib/neon/server";

const otpRequestSchema = z.object({
  email: z.string().trim().email(),
  mode: z.enum(["login", "signup"]).default("login"),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  redirectTo: z.string().optional(),
});

function safeRedirectPath(path: string | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard";
  }

  return path;
}

function safeOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (url.protocol !== "https:" && !isLocalhost) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getAppOrigin(request: Request) {
  return (
    safeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    safeOrigin(process.env.NEXT_PUBLIC_RUNTIME_BASE_URL) ??
    new URL(request.url).origin
  );
}

function publicAuthErrorMessage(error: { code?: string; status?: number; message?: string }) {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return "Email sign-in is rate-limited right now. Wait a few minutes, then request one fresh link.";
  }

  if (error.message?.toLowerCase().includes("redirect")) {
    return "Email sign-in is blocked because the return URL is not allow-listed for this workspace.";
  }

  if (error.message?.toLowerCase().includes("email provider") || error.message?.toLowerCase().includes("email logins")) {
    return "Email sign-in is not enabled for this workspace yet.";
  }

  if (error.message?.toLowerCase().includes("signup") || error.message?.toLowerCase().includes("user not found")) {
    return "No Astrail account exists for this email yet. Create an account first, then sign in.";
  }

  return "Could not send the Astrail sign-in email. Check the address or try social sign-in.";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, mode, firstName, lastName, redirectTo } = otpRequestSchema.parse(body);
    const origin = getAppOrigin(request);
    const next = safeRedirectPath(redirectTo);
    const emailRedirectTo = `${origin}/auth/complete?next=${encodeURIComponent(next)}`;
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    const auth = getNeonAuth() as ReturnType<typeof getNeonAuth> & {
      signIn: { magicLink(input: { email: string; callbackURL: string; name?: string }): Promise<{ error: { code?: string; status?: number; message?: string } | null }> };
    };
    const { error } = await auth.signIn.magicLink({
      email,
      callbackURL: emailRedirectTo,
      name: mode === "signup" ? fullName : undefined,
    });

    if (error) {
      console.warn("Astrail auth email failed", {
        status: error.status,
        code: error.code,
        name: "NeonAuthError",
      });

      const message = publicAuthErrorMessage(error);

      return NextResponse.json(
        {
          code: error.code ?? "auth_email_send_failed",
          error: message,
          status: error.status ?? 400,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { code: "invalid_email", error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message.includes("Workspace public storage is not configured")) {
      return NextResponse.json(
        {
          code: "auth_env_missing",
          error: "Email sign-in is not fully configured yet. Please contact support.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        code: "auth_unavailable",
        error: "Could not start Astrail email sign-in right now. Please try again in a moment.",
      },
      { status: 400 },
    );
  }
}
