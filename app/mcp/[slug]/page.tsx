import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { getSeoPage, seoPages } from "@/lib/seo-pages";

type McpIntentPageProps = {
  params: Promise<{ slug: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export function generateStaticParams() {
  return seoPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata(props: McpIntentPageProps): Promise<Metadata> {
  const params = await props.params;
  const page = getSeoPage(params.slug);
  if (!page) return {};

  const url = `/mcp/${page.slug}`;

  return {
    title: `${page.title} | Astrail`,
    description: page.description,
    keywords: ["Astrail", "MCP", "AI agents", ...page.keywords, ...page.intent],
    alternates: { canonical: url },
    openGraph: {
      title: `${page.title} | Astrail`,
      description: page.description,
      url,
      type: "article",
      siteName: "Astrail",
      modifiedTime: page.updated,
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: page.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | Astrail`,
      description: page.description,
      images: ["/og-image.jpg"],
    },
  };
}

export default async function McpIntentPage(props: McpIntentPageProps) {
  const params = await props.params;
  const page = getSeoPage(params.slug);
  if (!page) notFound();

  const related = seoPages.filter((candidate) => candidate.slug !== page.slug).slice(0, 3);
  const pageUrl = `${siteUrl}/mcp/${page.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description,
    datePublished: page.updated,
    dateModified: page.updated,
    keywords: page.keywords.join(", "),
    author: { "@type": "Organization", name: "Astrail" },
    publisher: {
      "@type": "Organization",
      name: "Astrail",
      logo: { "@type": "ImageObject", url: `${siteUrl}/brand/astrail-mark.svg` },
    },
    mainEntityOfPage: pageUrl,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Astrail", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "MCP", item: `${siteUrl}/mcp` },
      { "@type": "ListItem", position: 3, name: page.title, item: pageUrl },
    ],
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-neutral-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/mcp" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950">
            <ArrowLeft className="h-4 w-4" />
            MCP pages
          </Link>
          <Link href="/dashboard/generate" className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Generate</Link>
        </div>
      </header>

      <article className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-14">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">{page.category}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-5xl">
              {page.headline}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-600 sm:text-lg">{page.intro}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {page.intent.map((term) => (
                <span key={term} className="border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500">{term}</span>
              ))}
            </div>
          </div>

          <aside className="border border-neutral-200 bg-white p-5">
            <p className="text-sm font-semibold text-neutral-950">Why Astrail matches this search</p>
            <div className="mt-4 grid gap-3">
              {page.proofPoints.map((point) => (
                <div key={point} className="flex gap-3 border-t border-neutral-200 pt-3 text-sm leading-6 text-neutral-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-y border-neutral-200 bg-white">
            <section className="border-b border-neutral-200 p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-normal text-neutral-950">Fast path</h2>
              <div className="mt-5 grid gap-4">
                {page.steps.map((step, index) => (
                  <div key={step} className="grid gap-3 border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-[36px_1fr]">
                    <span className="grid h-8 w-8 place-items-center border border-neutral-200 bg-white text-sm font-semibold text-neutral-500">{index + 1}</span>
                    <p className="text-sm leading-6 text-neutral-600">{step}</p>
                  </div>
                ))}
              </div>
            </section>

            {page.sections.map((section) => (
              <section key={section.heading} className="border-b border-neutral-200 p-6 last:border-b-0 sm:p-8">
                <h2 className="text-2xl font-semibold tracking-normal text-neutral-950">{section.heading}</h2>
                <div className="mt-5 space-y-5 text-base leading-8 text-neutral-600">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="border-t border-neutral-200 p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-normal text-neutral-950">FAQ</h2>
              <div className="mt-5 divide-y divide-neutral-200">
                {page.faq.map((item) => (
                  <div key={item.question} className="py-5 first:pt-0 last:pb-0">
                    <h3 className="text-lg font-semibold text-neutral-950">{item.question}</h3>
                    <p className="mt-2 leading-7 text-neutral-600">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="border border-neutral-950 bg-neutral-950 p-5 text-white">
              <p className="text-sm font-semibold">Generate with Astrail</p>
              <p className="mt-3 text-sm leading-6 text-white/68">Paste API docs, review generated tools, host the MCP endpoint, and export SDKs when ready.</p>
              <Link href="/dashboard/generate" className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-orange-50">
                Start
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="border border-neutral-200 bg-white p-5">
              <p className="text-sm font-semibold text-neutral-950">Related searches</p>
              <div className="mt-4 grid gap-2">
                {related.map((item) => (
                  <Link key={item.slug} href={`/mcp/${item.slug}`} className="border-t border-neutral-200 pt-3 text-sm font-medium leading-6 text-neutral-600 hover:text-orange-700">
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </article>
    </main>
  );
}
