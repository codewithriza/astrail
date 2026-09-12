import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays } from "lucide-react";
import { blogPosts, getBlogPost } from "@/lib/blog-posts";

type BlogArticleProps = {
  params: Promise<{ slug: string }>;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(props: BlogArticleProps): Promise<Metadata> {
  const params = await props.params;
  const post = getBlogPost(params.slug);
  if (!post) return {};
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${post.title} | Astrail`,
      description: post.description,
      url,
      type: "article",
      siteName: "Astrail",
      publishedTime: post.date,
      images: [{ url: post.cover, width: 1200, height: 675, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | Astrail`,
      description: post.description,
      images: [post.cover],
    },
  };
}

export default async function BlogArticlePage(props: BlogArticleProps) {
  const params = await props.params;
  const post = getBlogPost(params.slug);
  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    image: `${siteUrl}${post.cover}`,
    author: { "@type": "Organization", name: "Astrail" },
    publisher: {
      "@type": "Organization",
      name: "Astrail",
      logo: { "@type": "ImageObject", url: `${siteUrl}/brand/astrail-mark.svg` },
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const related = blogPosts.filter((candidate) => candidate.slug !== post.slug).slice(0, 3);

  return (
    <main
      className="min-h-screen bg-[#f7f7f5] text-neutral-950"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950">
            <ArrowLeft className="h-4 w-4" />
            Blog
          </Link>
          <Link href="/dashboard" className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Dashboard</Link>
        </div>
      </header>

      <article className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">{post.category}</p>
            <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-5xl">
              {post.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-600 sm:text-lg">{post.intro}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {new Date(`${post.date}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
              </span>
              <span>{post.readingTime}</span>
            </div>
          </div>

          <div className="relative min-h-[260px] overflow-hidden border border-neutral-200 bg-neutral-100">
            <Image src={post.cover} alt="" fill priority sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-y border-neutral-200 bg-white">
            {post.sections.map((section) => (
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
                {post.faq.map((item) => (
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
              <p className="text-sm font-semibold text-neutral-950">Guide details</p>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-4 border-t border-neutral-200 pt-3">
                  <dt className="text-neutral-500">Category</dt>
                  <dd className="font-medium text-neutral-950">{post.category}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-neutral-200 pt-3">
                  <dt className="text-neutral-500">Read time</dt>
                  <dd className="font-medium text-neutral-950">{post.readingTime}</dd>
                </div>
              </dl>
            </div>
            <div className="border border-neutral-950 bg-neutral-950 p-5 text-white">
              <p className="text-sm font-semibold">Build with Astrail</p>
              <p className="mt-3 text-sm leading-6 text-white/68">Generate hosted MCP endpoints, SDK exports, docs, and runtime logs from one workspace.</p>
              <Link href="/dashboard/generate" className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-orange-50">
                Generate endpoint
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </div>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4 border-b border-neutral-200 pb-4">
            <h2 className="font-sans text-2xl font-semibold tracking-normal">Read next</h2>
            <Link href="/blog" className="text-sm font-medium text-neutral-500 hover:text-neutral-950">All guides</Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {related.map((item) => (
              <Link key={item.slug} href={`/blog/${item.slug}`} className="border border-neutral-200 bg-white p-5 transition hover:border-orange-300">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">{item.category}</p>
                <h3 className="mt-3 font-sans font-semibold leading-6 tracking-normal text-neutral-950">{item.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
