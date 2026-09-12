const updatedAt = "2026-06-13T00:00:00Z";

export const dynamic = "force-dynamic";

export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Astrail Status</title>
  <link href="https://status.astrail.dev" />
  <updated>${updatedAt}</updated>
  <id>https://status.astrail.dev</id>
  <entry>
    <title>All systems operational</title>
    <link href="https://status.astrail.dev" />
    <id>astrail-status-operational-2026-06-13</id>
    <updated>${updatedAt}</updated>
    <summary>Hosted MCP endpoints, dashboard, marketplace, billing, and generation workflows are running normally.</summary>
  </entry>
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
    },
  });
}
