import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ListChecks, ShieldCheck } from "lucide-react";
import { getRelatedUseCases, getUseCasePage, useCasePages } from "@/lib/use-cases";

type UseCaseArticleProps = {
  params: Promise<{ slug: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export function generateStaticParams() {
  return useCasePages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata(props: UseCaseArticleProps): Promise<Metadata> {
  const params = await props.params;
  const page = getUseCasePage(params.slug);
  if (!page) return {};

  const url = `/use-cases/${page.slug}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${page.title} | Astrail`,
      description: page.description,
      url,
      type: "article",
      siteName: "Astrail",
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

export default async function UseCaseArticlePage(props: UseCaseArticleProps) {
  const params = await props.params;
  const page = getUseCasePage(params.slug);
  if (!page) notFound();

  const related = getRelatedUseCases(page);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    image: `${siteUrl}/og-image.jpg`,
    author: { "@type": "Organization", name: "Astrail" },
    publisher: {
      "@type": "Organization",
      name: "Astrail",
      logo: { "@type": "ImageObject", url: `${siteUrl}/brand/astrail-mark.svg` },
    },
    mainEntityOfPage: `${siteUrl}/use-cases/${page.slug}`,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Use cases", item: `${siteUrl}/use-cases` },
      { "@type": "ListItem", position: 2, name: page.title, item: `${siteUrl}/use-cases/${page.slug}` },
    ],
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

  return (
    <main
      className="min-h-screen bg-[#f7f7f5] text-neutral-950"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/use-cases" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950">
            <ArrowLeft className="h-4 w-4" />
            Use cases
          </Link>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link href="/docs" className="hidden rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex">Docs</Link>
            <Link href="/dashboard/generate" className="rounded-md bg-neutral-950 px-4 py-2 text-white hover:bg-neutral-800">Generate</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">{page.category}</p>
            <h1 className="mt-4 max-w-4xl font-sans text-4xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-5xl">
              {page.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-600 sm:text-lg">{page.description}</p>
            <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-700">{page.promise}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard/generate" className="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
                Generate endpoint
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link href="/docs" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-white">Read docs</Link>
            </div>
          </div>

          <aside className="border border-neutral-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <Image src="/brand/astrail-mark.svg" alt="" width={32} height={32} />
              <div>
                <p className="text-sm font-semibold text-neutral-950">Best fit</p>
                <p className="text-sm leading-6 text-neutral-600">{page.audience}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {page.heroPoints.map((point) => (
                <div key={point} className="flex gap-3 border-t border-neutral-200 pt-3 text-sm leading-6 text-neutral-600">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-orange-700" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="border-y border-neutral-200 bg-white">
            <section className="border-b border-neutral-200 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <ListChecks className="h-5 w-5 text-orange-700" />
                <h2 className="font-sans text-2xl font-semibold tracking-normal text-neutral-950">Implementation path</h2>
              </div>
              <ol className="mt-5 grid gap-3">
                {page.workflow.map((step, index) => (
                  <li key={step} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 text-sm leading-6 text-neutral-600">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-neutral-950 text-xs font-semibold text-white">{index + 1}</span>
                    <span className="border-t border-neutral-200 pt-1.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {page.sections.map((section) => (
              <section key={section.heading} className="border-b border-neutral-200 p-6 last:border-b-0 sm:p-8">
                <h2 className="font-sans text-2xl font-semibold tracking-normal text-neutral-950">{section.heading}</h2>
                <div className="mt-5 space-y-5 text-base leading-8 text-neutral-600">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="border-t border-neutral-200 p-6 sm:p-8">
              <h2 className="font-sans text-2xl font-semibold tracking-normal text-neutral-950">FAQ</h2>
              <div className="mt-5 divide-y divide-neutral-200">
                {page.faq.map((item) => (
                  <div key={item.question} className="py-5 first:pt-0 last:pb-0">
                    <h3 className="font-sans text-lg font-semibold text-neutral-950">{item.question}</h3>
                    <p className="mt-2 leading-7 text-neutral-600">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="border border-neutral-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-orange-700" />
                <p className="text-sm font-semibold text-neutral-950">Astrail outputs</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {page.proofPoints.map((point) => (
                  <span key={point} className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700">
                    {point}
                  </span>
                ))}
              </div>
            </div>

            <div className="border border-neutral-950 bg-neutral-950 p-5 text-white">
              <p className="text-sm font-semibold">Related use cases</p>
              <div className="mt-4 grid gap-3">
                {related.map((item) => (
                  <Link key={item.slug} href={`/use-cases/${item.slug}`} className="group border-t border-white/15 pt-3 text-sm leading-6 text-white/68 hover:text-white">
                    <span className="flex items-center justify-between gap-3">
                      {item.shortTitle}
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-white/35 transition group-hover:text-white" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}
