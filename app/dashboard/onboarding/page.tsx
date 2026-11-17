import { OnboardingFlow } from "@/components/OnboardingFlow";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { presetServers } from "@/lib/preset-servers";

export const dynamic = "force-dynamic";

const iconNames: Record<string, string> = {
  "preset-google-drive": "googledrive", "preset-google-calendar": "googlecalendar", "preset-google-sheets": "googlesheets", "preset-google-docs": "googledocs",
};

export default async function OnboardingPage() {
  await getDashboardSessionUser();
  const preferred = ["preset-google-drive", "preset-github", "preset-notion", "preset-slack", "preset-linear", "preset-gmail", "preset-google-sheets", "preset-google-docs", "preset-vercel", "preset-airtable", "preset-hubspot", "preset-stripe", "preset-jira", "preset-figma", "preset-shopify", "preset-discord"];
  const apps = preferred.flatMap((id) => {
    const preset = presetServers.find((item) => item.id === id);
    if (!preset) return [];
    const slug = iconNames[id] ?? id.replace("preset-", "");
    return [{ id: preset.id, name: preset.name.replace(" MCP Template", ""), description: preset.description ?? "Ready-made Astrail integration.", icon: `/app-icons/${slug}.svg`, toolCount: preset.tools_json?.length ?? 0 }];
  });
  return <OnboardingFlow apps={apps} />;
}
