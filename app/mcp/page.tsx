import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { seoPages } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: "MCP Generator Pages | Astrail",
  description:
    "Focused Astrail pages for OpenAPI to MCP, API docs to MCP, Swagger to MCP, ChatGPT MCP tools, and hosted MCP server generation.",
  alternates: { canonical: "/mcp" },
  keywords: [
    "MCP generator",
    "OpenAPI to MCP",
    "API docs to MCP",
    "Swagger to MCP",
    "ChatGPT MCP tools",
    "Astrail.dev",
  ],
  openGraph: {
    title: "Astrail MCP Generator Pages",
    description:
      "OpenAPI to MCP, API docs to MCP, Swagger to MCP, ChatGPT MCP tools, and hosted MCP server generation.",
    url: "/mcp",
    siteName: "Astrail",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Astrail MCP generator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Astrail MCP Generator Pages",
    description: "Focused pages for high-intent MCP generation searches.",
    images: ["/og-image.jpg"],
  },
};

export default function McpIndexPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070807] text-[#f6f3ea]">
      <header className="border-b border-white/10 bg-[#070807]/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="text-xl font-black tracking-normal">Astrail</Link>
          <nav className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-normal text-white/62">
            <Link href="/docs" className="hidden px-3 py-2 hover:text-white sm:inline-flex">Docs</Link>
            <Link href="/blog" className="hidden px-3 py-2 hover:text-white sm:inline-flex">Blog</Link>
            <Link href="/dashboard/generate" className="bg-[#f6f3ea] px-4 py-2 text-[#070807] hover:bg-white">Generate</Link>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 sm:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(37,216,255,0.16),transparent_58%)]" />
        <div className="relative grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-4xl">
            <p className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#25d8ff]">
            <Search className="h-4 w-4" />
            MCP search intents
          </p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-normal text-white sm:text-7xl">
            Every MCP generation path, mapped.
          </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/62 sm:text-lg">
              OpenAPI, Swagger, API docs, ChatGPT tools, and hosted MCP endpoints all resolve to one reviewed Astrail runtime.
          </p>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-5 font-mono text-xs text-white/52">
            <div className="text-white/30">ASTRAIL_INDEX</div>
            <div className="mt-4 grid gap-2">
              <span className="text-[#25d8ff]">discover_source()</span>
              <span>build_endpoint_map()</span>
              <span>publish_mcp_runtime()</span>
            </div>
          </div>
        </div>

        <div className="relative mt-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2">
          {seoPages.map((page) => (
            <Link
              key={page.slug}
              href={`/mcp/${page.slug}`}
              className="group flex min-h-[250px] flex-col bg-[#11120f] p-6 transition hover:bg-[#171914]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#ff7a1a]">{page.category}</span>
                <ArrowUpRight className="h-5 w-5 text-white/28 transition group-hover:text-[#25d8ff]" />
              </div>
              <h2 className="mt-5 text-2xl font-black leading-8 tracking-normal text-white">{page.title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/58">{page.description}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-8">
                {page.intent.slice(0, 3).map((term) => (
                  <span key={term} className="border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-xs text-white/42">{term}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
