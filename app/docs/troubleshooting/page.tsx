import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Search } from "lucide-react";
import { AstrailLogo } from "@/components/AstrailLogo";
import { troubleshootingDocs } from "@/lib/troubleshooting-docs";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export const metadata: Metadata = {
  title: "MCP Troubleshooting Guides",
  description:
    "Troubleshoot Astrail MCP endpoint auth, tools/list, tools/call, OpenAPI schemas, CORS, rate limits, private setup, and generated SDK builds.",
  alternates: { canonical: "/docs/troubleshooting" },
  openGraph: {
    title: "MCP Troubleshooting Guides | Astrail",
    description:
      "Fix hosted MCP endpoint errors across auth, schemas, CORS, rate limits, private setup, and generated SDK builds.",
    url: "/docs/troubleshooting",
    siteName: "Astrail",
    type: "website",
  },
};

export default function TroubleshootingIndexPage() {
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Astrail MCP troubleshooting guides",
    description: metadata.description,
    url: `${siteUrl}/docs/troubleshooting`,
    mainEntity: troubleshootingDocs.map((doc, index) => ({
      "@type": "TechArticle",
      position: index + 1,
      headline: doc.title,
      description: doc.description,
      url: `${siteUrl}/docs/troubleshooting/${doc.slug}`,
    })),
  };

  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <header className="border-b border-white/10 bg-[#090909]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <AstrailLogo href="/docs" inverse markClassName="h-8 w-8" labelClassName="text-2xl text-white" />
          <nav className="hidden items-center gap-5 text-sm font-semibold text-white/56 sm:flex">
            <Link href="/docs" className="hover:text-white">Docs</Link>
            <Link href="/dashboard/generate" className="hover:text-white">Generate</Link>
            <Link href="/dashboard/sdk" className="hover:text-white">SDKs</Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-white/10 px-5 py-14 sm:py-18">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Troubleshooting</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-normal text-white sm:text-5xl">
            Fix MCP endpoint, schema, auth, and SDK errors.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/64">
            Practical runbooks for the errors teams hit after generating a hosted MCP endpoint: 401s, empty tool lists, validation failures, CORS, rate limits, private setup, and SDK build breaks.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Metric label="Guides" value={String(troubleshootingDocs.length)} />
            <Metric label="Primary path" value="MCP" />
            <Metric label="Use before" value="Support" />
          </div>
        </div>
      </section>

      <section className="px-5 py-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-6 border border-white/10 bg-white/[0.025] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white/72">
                <BookOpen className="h-4 w-4" />
                Error categories
              </h2>
              <div className="mt-4 grid gap-2 text-sm text-white/52">
                {Array.from(new Set(troubleshootingDocs.map((doc) => doc.category))).map((category) => (
                  <span key={category} className="border-t border-white/10 pt-2">{category}</span>
                ))}
              </div>
            </div>
          </aside>

          <div className="grid gap-4">
            {troubleshootingDocs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/troubleshooting/${doc.slug}`}
                className="group border border-white/10 bg-[#151515] p-5 transition hover:border-blue-400 hover:bg-white/[0.045]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-cyan-200">
                    <Search className="h-3.5 w-3.5" />
                    {doc.category}
                  </span>
                  <span className="text-xs text-white/42">{doc.keywords[0]}</span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <h2 className="text-2xl font-black tracking-normal text-white">{doc.title}</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">{doc.description}</p>
                  </div>
                  <div className="border-t border-white/10 pt-4 text-sm leading-6 text-white/58 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <span className="flex items-center gap-2 font-semibold text-white/72">
                      <CheckCircle2 className="h-4 w-4 text-lime-300" />
                      First check
                    </span>
                    <span className="mt-2 block">{doc.primaryCheck}</span>
                  </div>
                </div>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-300">
                  Open runbook
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.025] p-4">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/38">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}
