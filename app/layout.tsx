import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppQueryProvider } from "@/components/AppQueryProvider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Astrail | The deployment platform for MCP servers",
    template: "%s | Astrail",
  },
  description:
    "Build, connect, secure, and deploy MCP servers from one Astrail workspace.",
  applicationName: "Astrail",
  manifest: "/manifest.webmanifest",
  keywords: [
    "Astrail",
    "MCP",
    "MCP server",
    "agent OAuth",
    "per-user OAuth",
    "secure SaaS agent integrations",
    "OAuth token vault",
    "OpenAPI to MCP",
    "OpenAPI to MCP generator",
    "API docs to MCP",
    "Swagger to MCP",
    "Swagger to MCP server",
    "MCP server generator",
    "hosted MCP endpoint",
    "MCP SDK generator",
    "Website to MCP",
    "Code Mode",
    "search_docs",
    "OpenAI Agents MCP",
    "ChatGPT MCP",
    "Claude MCP",
    "Cursor MCP",
    "AI agents",
    "hosted MCP runtime",
    "agent tools",
    "workflow automation",
    "agent infrastructure",
    "Asteail",
    "Astail",
    "Astail.dev",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "Astrail | The deployment platform for MCP servers",
    description:
      "Run per-user provider consent, encrypted token refresh, operation scope checks, permissions, and audit logs behind one hosted MCP endpoint.",
    url: siteUrl,
    siteName: "Astrail",
    images: [{ url: "/og-image.jpg", width: 1920, height: 804, alt: "Astrail preview" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Astrail | Per-user OAuth for AI agents",
    description:
      "Secure third-party SaaS integrations with per-user grants, scope enforcement, hosted MCP, and audit logs.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Astrail",
    alternateName: ["Astrail MCP", "Astrail SDK Factory", "Astrail.dev", "Asteail", "Astail", "Astail.dev"],
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Hosted agent integration runtime for per-user OAuth, encrypted provider tokens, scope enforcement, permissions, audit logs, MCP endpoints, and SDK generation.",
    url: siteUrl,
    offers: {
      "@type": "Offer",
      category: "Hosted MCP runtime and SDK generation platform",
    },
    featureList: [
      "Per-user OAuth consent and encrypted provider token storage",
      "Operation-level OAuth scope enforcement",
      "Automatic token refresh and explicit reauthorization states",
      "OpenAPI to MCP generation",
      "Website-to-MCP generation",
      "Hosted HTTP JSON-RPC MCP endpoints",
      "Code Mode with search_docs and no-eval execute",
      "SDK Factory for TypeScript, Python, CLI, docs, tests, manifests, and CI",
      "Runtime permissions, auth-required states, trace ids, and structured logs",
    ],
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Astrail",
    url: siteUrl,
    logo: `${siteUrl}/brand/astrail-mark.svg`,
    description:
      "Astrail builds the per-user OAuth, permission, and audit layer between AI agents and third-party SaaS.",
    knowsAbout: [
      "Model Context Protocol",
      "MCP servers",
      "OAuth for AI agents",
      "Third-party SaaS integrations",
      "OpenAPI to MCP",
      "API docs to MCP",
      "Swagger to MCP",
      "AI agent tools",
      "SDK generation",
      "Runtime permissions",
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Astrail",
    alternateName: ["Astrail.dev", "Astrail MCP", "Asteail", "Astail", "Astail.dev"],
    url: siteUrl,
    description:
      "Documentation for per-user OAuth, secure SaaS agent integrations, hosted MCP endpoints, OpenAPI generation, Code Mode, and SDK Factory.",
    publisher: {
      "@type": "Organization",
      name: "Astrail",
      logo: `${siteUrl}/brand/astrail-mark.svg`,
    },
  };

  return (
    <html lang="en">
      <head />
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
      >
        <AppQueryProvider>{children}</AppQueryProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </body>
    </html>
  );
}
