import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Layers3 } from "lucide-react";
import { mcpReferenceEntries } from "@/lib/mcp-reference";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export const metadata: Metadata = {
  title: "MCP Glossary and FAQ",
  description:
    "A practical glossary for MCP tools, resources, prompts, JSON-RPC, hosted endpoints, transports, auth scopes, rate limits, MCPB, and SSRF.",
  alternates: {
    canonical: `${siteUrl}/docs/reference`,
  },
  openGraph: {
    title: "MCP Glossary and FAQ | Astrail",
    description:
      "Definitions, implementation notes, and FAQs for the MCP terms teams need when building hosted agent tools.",
    url: `${siteUrl}/docs/reference`,
    type: "article",
  },
};

const categories = Array.from(new Set(mcpReferenceEntries.map((entry) => entry.category)));

export default function McpReferenceIndexPage() {
  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-10 flex items-center gap-3 text-sm text-white/52" aria-label="Breadcrumb">
          <Link href="/docs" className="hover:text-white">
            Docs
          </Link>
          <span>/</span>
          <span className="text-white/78">MCP reference</span>
        </nav>

        <section className="border-b border-white/10 pb-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 sm:text-sm">
            Reference glossary
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-normal text-white sm:text-5xl">
            MCP terms, explained for teams shipping hosted agent tools.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/66">
            Definitions, implementation notes, and FAQs for the Model Context Protocol concepts that show up in
            generated tools, endpoint maps, hosted MCP runtimes, SDK bundles, and production security reviews.
          </p>
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="border border-white/10 bg-white/[0.025] p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white/72">
                <BookOpen className="h-4 w-4 text-blue-400" />
                Categories
              </h2>
              <div className="mt-4 grid gap-2">
                {categories.map((category) => (
                  <a key={category} href={`#${category.toLowerCase()}`} className="text-sm text-white/54 hover:text-white">
                    {category}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <div className="grid gap-8">
            {categories.map((category) => (
              <section key={category} id={category.toLowerCase()} className="scroll-mt-24">
                <h2 className="flex items-center gap-2 text-2xl font-black">
                  <Layers3 className="h-5 w-5 text-blue-400" />
                  {category}
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {mcpReferenceEntries
                    .filter((entry) => entry.category === category)
                    .map((entry) => (
                      <Link
                        key={entry.slug}
                        href={`/docs/reference/${entry.slug}`}
                        className="group border border-white/10 bg-[#151515] p-5 transition hover:border-blue-400 hover:bg-white/[0.04]"
                      >
                        <span className="font-mono text-xs uppercase tracking-[0.14em] text-white/38">
                          {entry.category}
                        </span>
                        <span className="mt-3 block text-xl font-black text-white">{entry.term}</span>
                        <span className="mt-3 block text-sm leading-6 text-white/58">{entry.metaDescription}</span>
                        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-300">
                          Read definition
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                        </span>
                      </Link>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
