import type { Metadata } from "next";
import AstrailLandingPage from "@/components/marketing/AstrailLandingPage";

export const metadata: Metadata = {
  title: "Astrail | Open-source tools for AI agents",
  description: "Turn API definitions into MCP tools. Open-source generation, execution policies, CLI, and SDKs. Get the code or read the documentation.",
  openGraph: { title: "Astrail | Open-source tools for AI agents", description: "Your APIs. Ready for agents. MIT licensed and open source." },
};

export default function Home() {
  return <AstrailLandingPage />;
}
