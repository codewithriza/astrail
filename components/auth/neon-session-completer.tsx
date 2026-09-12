"use client";

import { useEffect, useRef, useState } from "react";

type CompletionStatus = "idle" | "running" | "error";

type NeonSessionCompleterProps = {
  redirectTo?: string;
  exchangeCode?: boolean;
  hideMessage?: boolean;
  onStatusChange?: (status: CompletionStatus, message: string | null) => void;
};

function safeRedirectPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function callbackError(url: URL) {
  return url.searchParams.get("error_description") ?? url.searchParams.get("error");
}

export function NeonSessionCompleter({
  redirectTo,
  exchangeCode = false,
  hideMessage = false,
  onStatusChange,
}: NeonSessionCompleterProps) {
  const [message, setMessage] = useState<string | null>(null);
  const statusCallback = useRef(onStatusChange);

  useEffect(() => {
    statusCallback.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    const error = callbackError(url);

    if (error) {
      setMessage(error);
      statusCallback.current?.("error", error);
      return;
    }

    if (!exchangeCode) {
      statusCallback.current?.("idle", null);
      return;
    }

    async function completeSession() {
      statusCallback.current?.("running", "Verifying your Astrail session.");

      try {
        const response = await fetch("/api/auth/get-session", {
          cache: "no-store",
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const payload = await response.json().catch(() => null) as { user?: { id?: string } | null } | null;

        if (!response.ok || !payload?.user?.id) {
          throw new Error("Your sign-in session could not be confirmed. Please sign in again.");
        }
        if (cancelled) return;

        statusCallback.current?.("running", "Session confirmed. Opening your workspace.");
        window.location.replace(safeRedirectPath(redirectTo));
      } catch (cause) {
        if (cancelled) return;
        const nextMessage = cause instanceof Error
          ? cause.message
          : "Your sign-in session could not be confirmed. Please sign in again.";
        setMessage(nextMessage);
        statusCallback.current?.("error", nextMessage);
      }
    }

    void completeSession();
    return () => {
      cancelled = true;
    };
  }, [exchangeCode, redirectTo]);

  if (!message || hideMessage) return null;
  return <p className="mb-4 border border-red-400/40 bg-red-500/10 p-3 text-sm leading-relaxed text-red-100">{message}</p>;
}
