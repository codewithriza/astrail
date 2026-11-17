/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/api/mcp/[serverId]": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/website-to-mcp": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  outputFileTracingExcludes: {
    "**/*": [
      "./.git/**",
      "./.next/cache/**",
    ],
  },
  async redirects() {
    return [
      {
        source: "/asteail",
        destination: "/mcp/astrail-dev",
        permanent: true,
      },
      {
        source: "/astail",
        destination: "/mcp/astrail-dev",
        permanent: true,
      },
      {
        source: "/astail.dev",
        destination: "/mcp/astrail-dev",
        permanent: true,
      },
      {
        source: "/astrial",
        destination: "/mcp/astrail-dev",
        permanent: true,
      },
    ];
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
