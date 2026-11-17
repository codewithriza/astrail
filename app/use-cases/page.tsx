import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CheckCircle2, Workflow } from "lucide-react";
import { useCasePages } from "@/lib/use-cases";

export const metadata: Metadata = {
  title: "MCP use cases for AI agents",
  description:
    "Practical MCP use cases for SaaS APIs, internal tools, fintech, ecommerce, support, devtools, data APIs, workflow automation, and enterprise API catalogs.",
  alternates: { canonical: "/use-cases" },
  openGraph: {
    title: "MCP use cases for AI agents | Astrail",
    description:
      "Industry and workflow guides for turning APIs, websites, and internal tools into hosted MCP endpoints for AI agents.",
    url: "/use-cases",
    siteName: "Astrail",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Astrail" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MCP use cases for AI agents | Astrail",
    description: "Guides for building controlled MCP tools across SaaS, fintech, support, devtools, data, and automation.",
    images: ["/og-image.jpg"],
  },
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export default function UseCasesPage() {
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "MCP use cases for AI agents",
    description: metadata.description,
    url: `${siteUrl}/use-cases`,
    hasPart: useCasePages.map((page) => ({
      "@type": "WebPage",
      name: page.title,
      url: `${siteUrl}/use-cases/${page.slug}`,
      description: page.description,
    })),
  };

  return (
    <main
      className="min-h-screen overflow-hidden bg-[#070807] text-[#f6f3ea]"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />

      <header className="border-b border-white/10 bg-[#070807]/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3 text-xl font-black tracking-normal text-white">
            <Image src="/brand/astrail-mark.svg" alt="" width={32} height={32} />
            Astrail
          </Link>
          <nav className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-normal text-white/62">
            <Link href="/docs" className="hidden px-3 py-2 hover:text-white sm:inline-flex">Docs</Link>
            <Link href="/mcp" className="hidden px-3 py-2 hover:text-white sm:inline-flex">MCP</Link>
            <Link href="/dashboard/generate" className="bg-[#f6f3ea] px-4 py-2 text-[#070807] hover:bg-white">Generate</Link>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 sm:pt-24">
        <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#25d8ff]/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-6 h-80 w-80 rounded-full bg-[#ff7a1a]/10 blur-3xl" />
        <div className="relative grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-end">
          <div className="max-w-4xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#25d8ff]">Astrail use cases</p>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.95] tracking-normal text-white sm:text-7xl">
              MCP patterns for the APIs agents actually need.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-white/62 sm:text-lg">
              Guides for turning SaaS APIs, internal tools, support systems, data APIs, and enterprise catalogs into hosted MCP endpoints with reviewable auth, schemas, logs, and SDK exports.
            </p>
          </div>

          <aside className="border border-white/10 bg-white/[0.035] p-5">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white/38">Useful when you need</p>
            <div className="mt-4 grid gap-3 text-sm text-white/62">
              {["A controlled agent tool surface", "Generated MCP from real API contracts", "A path from prototype to owned SDK"].map((item) => (
                <div key={item} className="flex gap-3 border-t border-white/10 pt-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#25d8ff]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="relative mt-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 xl:grid-cols-3">
          {useCasePages.map((page) => (
            <Link
              key={page.slug}
              href={`/use-cases/${page.slug}`}
              className="group flex min-h-[340px] flex-col bg-[#11120f] p-6 transition hover:bg-[#171914]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="inline-flex h-11 w-11 items-center justify-center border border-white/10 bg-white/[0.035] text-[#25d8ff]">
                  <Workflow className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-5 w-5 text-white/28 transition group-hover:text-[#25d8ff]" />
              </div>
              <p className="mt-6 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#ff7a1a]">{page.category}</p>
              <h2 className="mt-3 text-2xl font-black leading-8 tracking-normal text-white">{page.title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/58">{page.description}</p>
              <div className="mt-auto flex items-start gap-2 pt-8 text-sm text-white/42">
                <BookOpen className="h-4 w-4" />
                <span>{page.proofPoints.slice(0, 2).join(" + ")}</span>
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-12 border border-white/10 bg-[#f6f3ea] p-6 text-[#070807] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h2 className="text-3xl font-black tracking-normal">Build the first endpoint from a real API.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/62">
                Import an OpenAPI spec, review the generated tool catalog, connect an MCP client, and export SDK artifacts when the workflow is ready to own.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/generate" className="bg-[#070807] px-4 py-2 text-sm font-bold text-white hover:bg-black">Generate endpoint</Link>
              <Link href="/docs" className="border border-black/15 px-4 py-2 text-sm font-bold text-[#070807] hover:bg-black/5">Read docs</Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
