const updatedAt = "Sat, 13 Jun 2026 00:00:00 GMT";

export const dynamic = "force-dynamic";

export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Astrail Status</title>
    <link>https://status.astrail.dev</link>
    <description>Operational updates for Astrail services.</description>
    <lastBuildDate>${updatedAt}</lastBuildDate>
    <item>
      <title>All systems operational</title>
      <link>https://status.astrail.dev</link>
      <description>Hosted MCP endpoints, dashboard, marketplace, billing, and generation workflows are running normally.</description>
      <pubDate>${updatedAt}</pubDate>
      <guid>astrail-status-operational-2026-06-13</guid>
    </item>
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
