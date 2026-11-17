import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { StatusSnapshot } from "./StatusSnapshot";

export const metadata: Metadata = {
  title: "Astrail Status",
  description: "Live deployment readiness for Astrail's hosted MCP runtime.",
};

export default function StatusPage() {
  return (
    <main className="min-h-screen bg-[#f7f7fb] text-neutral-950">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <header className="flex flex-col gap-5 border-b border-neutral-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/brand/astrail-mark.svg" alt="" width={512} height={512} className="h-9 w-9" />
            <span className="text-2xl font-semibold tracking-tight">Astrail Status</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50">
              Dashboard
            </Link>
            <Link href="/docs" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50">
              Docs
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        <StatusSnapshot />

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-neutral-500">Operational history</p>
            <h2 className="mt-1 text-xl font-semibold">Measured data only</h2>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              Astrail does not publish a historical uptime percentage yet. This page reports the live readiness probe directly and will show degraded service when required infrastructure or schema is unavailable.
            </p>
          </div>

          <aside className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <h2 className="font-semibold">Report a problem</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              If your endpoint is failing while the readiness probe is healthy, include the trace ID from the response when contacting support.
            </p>
            <a
              href="https://discord.gg/YhQGJ5ZJX4"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              Contact support
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </aside>
        </section>
      </div>
    </main>
  );
}
