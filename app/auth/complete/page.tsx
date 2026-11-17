"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { AuthLogo } from "@/components/auth/auth-shell";
import { NeonSessionCompleter } from "@/components/auth/neon-session-completer";

type CompletionStatus = "idle" | "running" | "error";

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function AuthCompleteContent() {
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams?.get("next") ?? null);
  const [status, setStatus] = useState<CompletionStatus>("running");
  const [message, setMessage] = useState("Securing your Astrail session.");
  const isError = status === "error";

  return (
    <main className="grid min-h-screen place-items-center bg-black px-5 py-10 text-white">
      <section className="w-full max-w-[420px]">
        <div className="flex flex-col items-center text-center">
          <AuthLogo inverse className="h-11 w-11" />
          <div className="mt-5 inline-flex items-center gap-2 border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-orange-200">
            {isError ? "Action needed" : "Secure sign-in"}
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            {isError ? "Sign-in needs attention" : "Opening your workspace"}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/52">
            {isError
              ? message
              : "Astrail is confirming your session and taking you to the dashboard."}
          </p>
        </div>

        <div className="mt-8 border border-white/10 bg-[#171717] p-5 shadow-sm">
          <NeonSessionCompleter
            redirectTo={redirectTo}
            exchangeCode
            hideMessage
            onStatusChange={(nextStatus, nextMessage) => {
              if (nextStatus !== "idle") setStatus(nextStatus);
              if (nextMessage) setMessage(nextMessage);
            }}
          />

          {isError ? (
            <div className="space-y-4">
              <div className="border border-red-400/35 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
                Start sign-in again. If you used an email link, open only the newest message.
              </div>
              <Link
                href="/login"
                className="flex h-11 items-center justify-center bg-white px-4 text-sm font-medium text-black transition hover:bg-orange-50"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 border border-white/10 bg-black/35 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-orange-300" />
                <span className="text-sm text-white/78">{message}</span>
              </div>

              <div className="h-1.5 overflow-hidden bg-white/10">
                <div className="h-full w-2/3 animate-pulse bg-orange-500" />
              </div>

              <div className="grid gap-2 text-sm">
                <CompletionStep active label="Verify secure callback" />
                <CompletionStep active label="Create browser session" />
                <CompletionStep label="Open dashboard" />
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/42">
                <span>Your password stays with the identity provider</span>
                <ArrowRight className="h-3.5 w-3.5 text-orange-300" />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<AuthCompleteFallback />}>
      <AuthCompleteContent />
    </Suspense>
  );
}

function AuthCompleteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-black px-5 text-white">
      <div className="flex items-center gap-3 border border-white/10 bg-[#171717] px-5 py-4 text-sm text-white/70">
        <Loader2 className="h-4 w-4 animate-spin text-orange-300" />
        Opening your workspace...
      </div>
    </main>
  );
}

function CompletionStep({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-white/[0.08] bg-black/20 px-3 py-2.5">
      <span className={active ? "text-white/76" : "text-white/38"}>{label}</span>
      {active ? <ShieldCheck className="h-4 w-4 text-orange-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/25" />}
    </div>
  );
}
