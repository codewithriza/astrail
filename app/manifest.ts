import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Astrail MCP Platform",
    short_name: "Astrail",
    description: "Build, govern, and run hosted MCP integrations.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
