import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, Terminal } from "lucide-react";
import { getRelatedTutorials, getTutorial, tutorials } from "@/lib/tutorials";

type TutorialPageProps = {
  params: Promise<{ slug: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export function generateStaticParams() {
  return tutorials.map((tutorial) => ({ slug: tutorial.slug }));
}

export async function generateMetadata(props: TutorialPageProps): Promise<Metadata> {
  const params = await props.params;
  const tutorial = getTutorial(params.slug);
  if (!tutorial) return {};
  const url = `/tutorials/${tutorial.slug}`;
  return {
    title: `${tutorial.title} | Astrail Tutorials`,
    description: tutorial.description,
    keywords: tutorial.searchIntent,
    alternates: { canonical: url },
    openGraph: {
      title: `${tutorial.title} | Astrail Tutorials`,
      description: tutorial.description,
      url,
      type: "article",
      siteName: "Astrail",
      publishedTime: tutorial.date,
      modifiedTime: tutorial.updated,
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: tutorial.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${tutorial.title} | Astrail Tutorials`,
      description: tutorial.description,
      images: ["/og-image.jpg"],
    },
  };
}

export default async function TutorialArticlePage(props: TutorialPageProps) {
  const params = await props.params;
  const tutorial = getTutorial(params.slug);
  if (!tutorial) notFound();

  const related = getRelatedTutorials(tutorial);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: tutorial.title,
    description: tutorial.description,
    datePublished: tutorial.date,
    dateModified: tutorial.updated,
    totalTime: tutorial.readingTime,
    image: `${siteUrl}/og-image.jpg`,
    publisher: {
      "@type": "Organization",
      name: "Astrail",
      logo: { "@type": "ImageObject", url: `${siteUrl}/brand/astrail-mark.svg` },
    },
    step: tutorial.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
    mainEntityOfPage: `${siteUrl}/tutorials/${tutorial.slug}`,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tutorial.faq.map((item) => ({
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/tutorials" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950">
            <ArrowLeft className="h-4 w-4" />
            Tutorials
          </Link>
          <Link href="/dashboard/generate" className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Generate MCP</Link>
        </div>
      </header>

      <article className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{tutorial.category}</p>
            <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-5xl">
              {tutorial.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-600 sm:text-lg">{tutorial.description}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {new Date(`${tutorial.updated}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
              </span>
              <span>{tutorial.readingTime}</span>
              <span>{tutorial.difficulty}</span>
            </div>
          </div>

          <aside className="border border-neutral-200 bg-white p-5">
            <p className="text-sm font-semibold text-neutral-950">You will finish with</p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">{tutorial.outcome}</p>
            <div className="mt-5 border-t border-neutral-200 pt-4">
              <p className="text-sm font-semibold text-neutral-950">Prerequisites</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
                {tutorial.prerequisites.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-blue-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-y border-neutral-200 bg-white">
            <section className="border-b border-neutral-200 p-6 sm:p-8">
              <h2 className="font-sans text-2xl font-semibold tracking-normal text-neutral-950">Steps</h2>
              <div className="mt-6 space-y-8">
                {tutorial.steps.map((step, index) => (
                  <div key={step.title} className="border-t border-neutral-200 pt-6 first:border-t-0 first:pt-0">
                    <div className="flex gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-sm font-semibold text-white">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-sans text-xl font-semibold tracking-normal text-neutral-950">{step.title}</h3>
                        <p className="mt-3 text-base leading-8 text-neutral-600">{step.body}</p>
                        {step.code ? (
                          <div className="mt-4 overflow-hidden border border-neutral-200 bg-neutral-950">
                            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white/52">
                              <Terminal className="h-4 w-4" />
                              Example
                            </div>
                            <pre className="overflow-x-auto p-4 text-sm leading-6 text-blue-50"><code>{step.code}</code></pre>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-b border-neutral-200 p-6 sm:p-8">
              <h2 className="font-sans text-2xl font-semibold tracking-normal text-neutral-950">Production checks</h2>
              <div className="mt-5 grid gap-3">
                {tutorial.checks.map((item) => (
                  <div key={item} className="flex gap-3 border border-neutral-200 bg-[#f7f7f5] p-4 text-sm leading-6 text-neutral-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="p-6 sm:p-8">
              <h2 className="font-sans text-2xl font-semibold tracking-normal text-neutral-950">FAQ</h2>
              <div className="mt-5 divide-y divide-neutral-200">
                {tutorial.faq.map((item) => (
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
              <p className="text-sm font-semibold text-neutral-950">Related tutorials</p>
              <div className="mt-4 grid gap-3">
                {related.map((item) => (
                  <Link key={item.slug} href={`/tutorials/${item.slug}`} className="group border-t border-neutral-200 pt-3 text-sm font-medium leading-6 text-neutral-700 hover:text-blue-700">
                    {item.title}
                    <ArrowUpRight className="ml-1 inline h-3.5 w-3.5 opacity-50 transition group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </div>
            <div className="border border-neutral-950 bg-neutral-950 p-5 text-white">
              <p className="text-sm font-semibold">Try it in Astrail</p>
              <p className="mt-3 text-sm leading-6 text-white/68">Generate a hosted MCP endpoint, inspect tools/list, and export SDK docs from the same server.</p>
              <Link href="/dashboard/generate" className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-blue-50">
                Generate endpoint
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}
