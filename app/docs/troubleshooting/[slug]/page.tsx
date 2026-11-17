import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Terminal } from "lucide-react";
import { AstrailLogo } from "@/components/AstrailLogo";
import {
  getRelatedTroubleshootingDocs,
  getTroubleshootingDoc,
  troubleshootingDocs,
} from "@/lib/troubleshooting-docs";

type TroubleshootingArticleProps = {
  params: Promise<{ slug: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export function generateStaticParams() {
  return troubleshootingDocs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata(props: TroubleshootingArticleProps): Promise<Metadata> {
  const params = await props.params;
  const doc = getTroubleshootingDoc(params.slug);
  if (!doc) return {};
  const url = `/docs/troubleshooting/${doc.slug}`;

  return {
    title: doc.title,
    description: doc.description,
    keywords: doc.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: `${doc.title} | Astrail`,
      description: doc.description,
      url,
      type: "article",
      siteName: "Astrail",
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} | Astrail`,
      description: doc.description,
    },
  };
}

export default async function TroubleshootingArticlePage(props: TroubleshootingArticleProps) {
  const params = await props.params;
  const doc = getTroubleshootingDoc(params.slug);
  if (!doc) notFound();

  const related = getRelatedTroubleshootingDocs(doc);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: doc.title,
    description: doc.description,
    keywords: doc.keywords.join(", "),
    author: { "@type": "Organization", name: "Astrail" },
    publisher: {
      "@type": "Organization",
      name: "Astrail",
      logo: { "@type": "ImageObject", url: `${siteUrl}/brand/astrail-mark.svg` },
    },
    mainEntityOfPage: `${siteUrl}/docs/troubleshooting/${doc.slug}`,
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: doc.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="border-b border-white/10 bg-[#090909]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <AstrailLogo href="/docs" inverse markClassName="h-8 w-8" labelClassName="text-2xl text-white" />
          <Link href="/docs/troubleshooting" className="inline-flex items-center gap-2 text-sm font-semibold text-white/58 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Troubleshooting
          </Link>
        </div>
      </header>

      <article className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{doc.category}</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-normal text-white sm:text-5xl">{doc.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/64">{doc.description}</p>

          <section className="mt-8 grid gap-4 border border-white/10 bg-[#151515] p-5 md:grid-cols-3">
            <Diagnostic label="Symptom" value={doc.symptom} />
            <Diagnostic label="First check" value={doc.primaryCheck} />
            <Diagnostic label="Quick fix" value={doc.quickFix} />
          </section>

          <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
            {doc.sections.map((section, index) => (
              <section key={section.title} id={`step-${index + 1}`} className="scroll-mt-24 py-8">
                <div className="flex items-start gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center border border-white/10 bg-white/[0.035] font-mono text-sm text-cyan-200">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-black tracking-normal text-white">{section.title}</h2>
                    <p className="mt-4 text-base leading-8 text-white/62">{section.body}</p>
                  </div>
                </div>
              </section>
            ))}
          </div>

          <section className="mt-10 border border-white/10 bg-[#151515] p-6">
            <h2 className="text-2xl font-black tracking-normal text-white">FAQ</h2>
            <div className="mt-5 divide-y divide-white/10">
              {doc.faq.map((item) => (
                <div key={item.question} className="py-5 first:pt-0 last:pb-0">
                  <h3 className="font-semibold text-white">{item.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-white/58">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-black tracking-normal text-white">Related runbooks</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {related.map((item) => (
                <Link key={item.slug} href={`/docs/troubleshooting/${item.slug}`} className="group border border-white/10 bg-white/[0.025] p-4 hover:border-blue-400">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">{item.category}</span>
                  <span className="mt-3 block text-sm font-semibold leading-6 text-white">{item.title}</span>
                  <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-300">
                    Open
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="border border-white/10 bg-[#151515] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white/72">
              <Terminal className="h-4 w-4" />
              Runbook summary
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <SummaryRow label="Category" value={doc.category} />
              <SummaryRow label="Keyword" value={doc.keywords[0]} />
              <SummaryRow label="Docs path" value={`/docs/troubleshooting/${doc.slug}`} />
            </dl>
          </div>
          <div className="border border-blue-500/40 bg-blue-500/[0.06] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <CheckCircle2 className="h-4 w-4 text-lime-300" />
              Before escalating
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/62">
              Capture the endpoint URL, JSON-RPC method, response error code, trace ID if present, and whether curl behaves differently from the MCP client.
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.025] p-5">
            <Link href="/docs" className="text-sm font-semibold text-blue-300 hover:text-blue-200">Back to Astrail docs</Link>
          </div>
        </aside>
      </article>
    </main>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/38">{label}</p>
      <p className="mt-2 text-sm leading-6 text-white/62">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-white/10 pt-3">
      <dt className="text-white/38">{label}</dt>
      <dd className="mt-1 break-words font-medium text-white/72">{value}</dd>
    </div>
  );
}
