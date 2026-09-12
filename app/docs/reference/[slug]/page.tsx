import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import {
  getMcpReferenceEntry,
  getRelatedMcpEntries,
  mcpReferenceEntries,
  type McpReferenceEntry,
} from "@/lib/mcp-reference";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return mcpReferenceEntries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const entry = getMcpReferenceEntry(params.slug);

  if (!entry) {
    return {
      title: "MCP Reference",
    };
  }

  const url = `${siteUrl}/docs/reference/${entry.slug}`;

  return {
    title: entry.metaTitle,
    description: entry.metaDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${entry.metaTitle} | Astrail`,
      description: entry.metaDescription,
      url,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${entry.metaTitle} | Astrail`,
      description: entry.metaDescription,
    },
  };
}

export default async function McpReferenceTermPage(props: PageProps) {
  const params = await props.params;
  const entry = getMcpReferenceEntry(params.slug);

  if (!entry) {
    notFound();
  }

  const relatedEntries = getRelatedMcpEntries(entry);
  const jsonLd = buildJsonLd(entry);

  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8">
        <article className="min-w-0">
          <nav className="mb-10 flex flex-wrap items-center gap-3 text-sm text-white/52" aria-label="Breadcrumb">
            <Link href="/docs" className="hover:text-white">
              Docs
            </Link>
            <span>/</span>
            <Link href="/docs/reference" className="hover:text-white">
              MCP reference
            </Link>
            <span>/</span>
            <span className="text-white/78">{entry.term}</span>
          </nav>

          <Link href="/docs/reference" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200">
            <ArrowLeft className="h-4 w-4" />
            MCP glossary
          </Link>

          <header className="mt-6 border-b border-white/10 pb-10">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 sm:text-sm">
              {entry.category}
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-normal text-white sm:text-5xl">
              {entry.term}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/66">{entry.metaDescription}</p>
          </header>

          <section className="mt-10">
            <h2 className="text-2xl font-black">Definition</h2>
            <p className="mt-4 text-base leading-7 text-white/64">{entry.definition}</p>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-black">How Astrail Uses It</h2>
            <p className="mt-4 text-base leading-7 text-white/64">{entry.astrailUsage}</p>
          </section>

          {entry.example ? (
            <section className="mt-10">
              <h2 className="text-2xl font-black">Example</h2>
              <pre className="mt-4 max-w-full overflow-auto border border-white/10 bg-[#151515] p-4 text-sm leading-7 text-white/72">
                <code>{entry.example}</code>
              </pre>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-2xl font-black">Implementation Checklist</h2>
            <div className="mt-4 grid gap-3">
              {entry.checklist.map((item) => (
                <div key={item} className="flex gap-3 border border-white/10 bg-[#151515] p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-lime-300" />
                  <p className="text-sm leading-6 text-white/62">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-black">FAQ</h2>
            <div className="mt-4 grid gap-3">
              {entry.faqs.map((faq) => (
                <div key={faq.question} className="border border-white/10 bg-white/[0.025] p-5">
                  <h3 className="font-semibold text-white">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </article>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="border border-white/10 bg-[#151515] p-5">
            <h2 className="font-semibold text-white">Related terms</h2>
            <div className="mt-4 grid gap-2">
              {relatedEntries.map((relatedEntry) => (
                <Link
                  key={relatedEntry.slug}
                  href={`/docs/reference/${relatedEntry.slug}`}
                  className="group flex items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/62 hover:border-blue-400 hover:text-white"
                >
                  <span>{relatedEntry.term}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-white/32 transition group-hover:translate-x-1 group-hover:text-blue-300" />
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-4 border border-white/10 bg-[#151515] p-5">
            <h2 className="font-semibold text-white">Sources</h2>
            <div className="mt-4 grid gap-3">
              {entry.sources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-3 text-sm leading-6 text-white/58 hover:text-white"
                >
                  <span>{source.label}</span>
                  <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-white/34" />
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}

function buildJsonLd(entry: McpReferenceEntry) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    name: entry.metaTitle,
    description: entry.metaDescription,
    mainEntity: entry.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
