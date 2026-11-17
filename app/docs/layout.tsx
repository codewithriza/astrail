import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Astrail Docs | OpenAPI to MCP, hosted MCP servers, and SDK Factory",
  description:
    "Production documentation for Astrail hosted MCP endpoints, OpenAPI to MCP generation, website-to-MCP, Code Mode, SDK exports, runtime permissions, and agent tools.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Astrail Docs | Hosted MCP servers and agent tools",
    description:
      "Guides for turning APIs, websites, and workflows into hosted MCP endpoints, SDKs, docs, manifests, and runtime logs.",
    url: "/docs",
    siteName: "Astrail",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Astrail Docs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Astrail Docs | Hosted MCP servers and agent tools",
    description: "OpenAPI to MCP, website-to-MCP, Code Mode, SDK Factory, and production agent-tool docs.",
    images: ["/og-image.jpg"],
  },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return children;
}
