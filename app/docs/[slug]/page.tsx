import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight } from "lucide-react";
import { AstrailLogo } from "@/components/AstrailLogo";
import { docsGuides, getDocsGuide } from "@/lib/docs-guides";

type DocsGuidePageProps = {
  params: Promise<{ slug: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export function generateStaticParams() {
  return docsGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata(props: DocsGuidePageProps): Promise<Metadata> {
  const params = await props.params;
  const guide = getDocsGuide(params.slug);
  if (!guide) return {};

  const url = `/docs/${guide.slug}`;

  return {
    title: `${guide.title} | Astrail Docs`,
    description: guide.description,
    keywords: ["Astrail docs", "MCP", "AI agents", ...guide.intent],
    alternates: { canonical: url },
    openGraph: {
      title: `${guide.title} | Astrail Docs`,
      description: guide.description,
      url,
      type: "article",
      siteName: "Astrail",
      modifiedTime: guide.updated,
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: guide.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${guide.title} | Astrail Docs`,
      description: guide.description,
      images: ["/og-image.jpg"],
    },
  };
}

export default async function DocsGuidePage(props: DocsGuidePageProps) {
  const params = await props.params;
  const guide = getDocsGuide(params.slug);
  if (!guide) notFound();

  const related = docsGuides.filter((candidate) => candidate.slug !== guide.slug).slice(0, 3);
  const pageUrl = `${siteUrl}/docs/${guide.slug}`;
  const updatedDate = new Date(`${guide.updated}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: guide.title,
    description: guide.description,
    dateModified: guide.updated,
    datePublished: guide.updated,
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
    mainEntity: guide.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-[#090909] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <DocsGuideTopbar activeSlug={guide.slug} />
      <GuideMobileNav activeSlug={guide.slug} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)] lg:pl-[300px] xl:grid-cols-[minmax(0,1fr)_260px]">
        <GuideSidebar activeSlug={guide.slug} />

        <article className="min-w-0 border-white/10 px-4 py-8 sm:px-6 sm:py-10 lg:border-l lg:px-8 xl:border-r">
          <div className="mx-auto max-w-4xl">
            <section id="overview" className="scroll-mt-24">
              <Link href="/docs" className="inline-flex items-center gap-2 text-sm font-semibold text-white/48 hover:text-white">
                Docs
                <ChevronRight className="h-4 w-4" />
                <span className="text-white/72">{guide.title}</span>
              </Link>
              <p className="mt-8 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 sm:text-sm">{guide.category}</p>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-normal text-white sm:text-4xl">{guide.title}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/68">{guide.intro}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-white/45">
                <span className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.035] px-3 py-2">
                  <CalendarDays className="h-4 w-4" />
                  Updated {updatedDate}
                </span>
                <span className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.035] px-3 py-2">
                  <BookOpen className="h-4 w-4" />
                  {guide.readingTime}
                </span>
              </div>
            </section>

            <section id="implementation" className="mt-10 scroll-mt-24 border border-white/10 bg-[#151515]">
              <div className="border-b border-white/10 p-5">
                <SectionHeading eyebrow="Implementation" title="Path to ship." />
              </div>
              <div className="grid gap-0">
                {guide.steps.map((step, index) => (
                  <div key={step} className="grid gap-4 border-b border-white/10 bg-white/[0.025] p-4 last:border-b-0 sm:grid-cols-[44px_1fr]">
                    <div className="grid h-9 w-9 place-items-center border border-white/10 bg-black/30 font-mono text-sm text-white/56">{index + 1}</div>
                    <div className="flex min-w-0 gap-3 text-sm leading-6 text-white/64">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
                      <span>{step}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {guide.sections.map((section) => (
              <section key={section.heading} id={slugify(section.heading)} className="mt-12 scroll-mt-24">
                <SectionHeading eyebrow="Guide" title={section.heading} />
                <div className="mt-5 border border-white/10 bg-[#151515]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="border-b border-white/10 p-5 text-base leading-8 text-white/62 last:border-b-0">
                      {paragraph}
                    </p>
                  ))}
                </div>
                {section.examples ? (
                  <div className="mt-5 grid gap-4">
                    {section.examples.map((example) => (
                      <div key={example.name} className="border border-cyan-400/20 bg-cyan-400/[0.045] p-5">
                        <p className="font-mono text-sm font-bold text-cyan-200">{example.name}</p>
                        <p className="mt-2 text-sm leading-6 text-white/62">{example.description}</p>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <CodeBlock label="Generated input schema" code={example.inputSchema} />
                          <CodeBlock label="Example tools/call" code={example.sampleCall} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}

            <section id="faq" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="FAQ" title="Common questions." />
              <div className="mt-5 border border-white/10 bg-[#151515]">
                {guide.faq.map((item) => (
                  <div key={item.question} className="border-b border-white/10 p-5 last:border-b-0">
                    <h2 className="text-lg font-black tracking-normal text-white">{item.question}</h2>
                    <p className="mt-3 text-base leading-7 text-white/58">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="related" className="mt-12 scroll-mt-24 border border-blue-500/40 bg-blue-500/[0.06] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHeading eyebrow="Related" title="Keep reading." />
                <Link href="/docs" className="text-sm font-semibold text-blue-300 hover:text-white">Docs home</Link>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {related.map((item) => (
                  <Link key={item.slug} href={`/docs/${item.slug}`} className="border border-white/10 bg-black/30 p-4 hover:border-blue-400">
                    <span className="block font-semibold text-white">{item.title}</span>
                    <span className="mt-2 block text-sm leading-6 text-white/55">{item.description}</span>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-300">
                      Open
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </article>

        <GuideToc guide={guide} />
      </div>
    </main>
  );
}

function DocsGuideTopbar({ activeSlug }: { activeSlug: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090909]">
      <div className="flex h-16 min-w-0 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <AstrailLogo href="/docs" inverse markClassName="h-8 w-8" labelClassName="text-2xl text-white" />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-white/56 md:flex">
          <Link href="/docs" className="text-blue-400">Docs</Link>
          <Link href="/marketplace" className="hover:text-white">Catalog</Link>
          <Link href="/dashboard/sdk" className="hover:text-white">SDKs</Link>
          <Link href="/dashboard/generate" className="hover:text-white">MCP</Link>
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {docsGuides.slice(0, 3).map((guide) => (
            <Link
              key={guide.slug}
              href={`/docs/${guide.slug}`}
              className={`border px-3 py-2 text-sm font-medium ${guide.slug === activeSlug ? "border-blue-500 bg-blue-500/[0.08] text-white" : "border-white/10 bg-white/[0.035] text-white/56 hover:border-blue-400 hover:text-white"}`}
            >
              {guide.title}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

function GuideMobileNav({ activeSlug }: { activeSlug: string }) {
  return (
    <nav className="sticky top-16 z-30 border-b border-white/10 bg-[#090909] px-4 py-3 lg:hidden" aria-label="Docs guides">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/docs" className="shrink-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-medium text-white/72 hover:border-blue-400 hover:text-white">
          Home
        </Link>
        {docsGuides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/docs/${guide.slug}`}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${guide.slug === activeSlug ? "border-blue-500 bg-blue-500/[0.08] text-white" : "border-white/10 bg-white/[0.035] text-white/72 hover:border-blue-400 hover:text-white"}`}
          >
            {guide.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function GuideSidebar({ activeSlug }: { activeSlug: string }) {
  return (
    <aside className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:z-30 lg:block lg:w-[300px] lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-white/10 lg:bg-[#090909] lg:px-4 lg:py-6">
      <nav className="space-y-8">
        <div>
          <h2 className="px-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-white/38">Docs</h2>
          <div className="mt-3 grid gap-1">
            <Link href="/docs" className="flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium text-white/72 hover:bg-white/[0.04] hover:text-white">
              <span>Quickstart</span>
            </Link>
          </div>
        </div>

        <div>
          <h2 className="px-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-white/38">Guides</h2>
          <div className="mt-3 grid gap-1">
            {docsGuides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/docs/${guide.slug}`}
                className={`flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium ${guide.slug === activeSlug ? "bg-white/[0.06] text-white" : "text-white/72 hover:bg-white/[0.04] hover:text-white"}`}
              >
                <span>{guide.title}</span>
                {guide.slug === activeSlug ? <ChevronRight className="h-4 w-4 text-blue-400" /> : null}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="px-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-white/38">Actions</h2>
          <div className="mt-3 grid gap-1">
            <Link href="/dashboard/generate" className="rounded-md px-2 py-2 text-sm font-medium text-white/72 hover:bg-white/[0.04] hover:text-white">Generate MCP</Link>
            <Link href="/dashboard/sdk" className="rounded-md px-2 py-2 text-sm font-medium text-white/72 hover:bg-white/[0.04] hover:text-white">Export SDKs</Link>
          </div>
        </div>
      </nav>
    </aside>
  );
}

function GuideToc({ guide }: { guide: NonNullable<ReturnType<typeof getDocsGuide>> }) {
  const links = [
    ["Overview", "#overview"],
    ["Implementation", "#implementation"],
    ...guide.sections.map((section) => [section.heading, `#${slugify(section.heading)}`]),
    ["FAQ", "#faq"],
    ["Related", "#related"],
  ];

  return (
    <aside className="hidden px-6 py-10 xl:sticky xl:top-16 xl:block xl:max-h-[calc(100vh-4rem)]">
      <div className="text-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-white/68">
          <BookOpen className="h-4 w-4" />
          On this page
        </h2>
        <nav className="grid gap-3 border-l border-white/10 pl-4">
          {links.map(([label, href], index) => (
            <Link key={href} href={href} className={`${index === 0 ? "text-blue-400" : "text-white/48"} hover:text-white`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-blue-400 sm:text-sm">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-black tracking-normal text-white sm:text-3xl">{title}</h2>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <pre className="mt-2 max-h-[360px] overflow-x-auto border border-white/10 bg-black/45 p-4 text-xs leading-5 text-white/72">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
