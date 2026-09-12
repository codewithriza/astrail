"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/status/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Could not subscribe.");
      setMessage("You are subscribed to Astrail status updates.");
      setEmail("");
    } catch (subscribeError) {
      setError(subscribeError instanceof Error ? subscribeError.message : "Could not subscribe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={subscribe} className="w-full max-w-md lg:w-[420px]">
      <div>
        <p className="text-sm font-semibold text-neutral-950">Subscribe to incident updates</p>
        <p className="mt-1 text-sm text-neutral-500">Email alerts for new and resolved incidents.</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none transition focus:border-neutral-950 focus:ring-4 focus:ring-neutral-100"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Subscribe
        </button>
      </div>
      {message ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
