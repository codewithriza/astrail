import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blog-posts";
import { docsGuides } from "@/lib/docs-guides";
import { mcpReferenceEntries } from "@/lib/mcp-reference";
import { seoPages } from "@/lib/seo-pages";
import { troubleshootingDocs } from "@/lib/troubleshooting-docs";
import { tutorials } from "@/lib/tutorials";
import { useCasePages } from "@/lib/use-cases";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${siteUrl}/docs/troubleshooting`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${siteUrl}/mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.93 },
    { url: `${siteUrl}/tutorials`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/use-cases`, lastModified: now, changeFrequency: "weekly", priority: 0.86 },
    { url: `${siteUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/marketplace`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/get-started`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/llms.txt`, lastModified: now, changeFrequency: "weekly", priority: 0.65 },
    { url: `${siteUrl}/llms-full.txt`, lastModified: now, changeFrequency: "weekly", priority: 0.65 },
    { url: `${siteUrl}/docs.json`, lastModified: now, changeFrequency: "weekly", priority: 0.65 },
  ];

  const docsPages: MetadataRoute.Sitemap = docsGuides.map((guide) => ({
    url: `${siteUrl}/docs/${guide.slug}`,
    lastModified: new Date(`${guide.updated}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.86,
  }));

  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(`${post.date}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.72,
  }));

  const mcpPages: MetadataRoute.Sitemap = seoPages.map((page) => ({
    url: `${siteUrl}/mcp/${page.slug}`,
    lastModified: new Date(`${page.updated}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: page.slug === "openapi-to-mcp-generator" ? 0.92 : 0.84,
  }));

  const tutorialPages: MetadataRoute.Sitemap = tutorials.map((tutorial) => ({
    url: `${siteUrl}/tutorials/${tutorial.slug}`,
    lastModified: new Date(`${tutorial.updated}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.82,
  }));

  const useCaseEntries: MetadataRoute.Sitemap = useCasePages.map((page) => ({
    url: `${siteUrl}/use-cases/${page.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.76,
  }));

  const referencePages: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/docs/reference`, lastModified: now, changeFrequency: "monthly", priority: 0.84 },
    ...mcpReferenceEntries.map((entry) => ({
      url: `${siteUrl}/docs/reference/${entry.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.76,
    })),
  ];

  const troubleshootingPages: MetadataRoute.Sitemap = troubleshootingDocs.map((doc) => ({
    url: `${siteUrl}/docs/troubleshooting/${doc.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    ...staticPages,
    ...mcpPages,
    ...docsPages,
    ...tutorialPages,
    ...useCaseEntries,
    ...referencePages,
    ...troubleshootingPages,
    ...blogPages,
  ];
}
