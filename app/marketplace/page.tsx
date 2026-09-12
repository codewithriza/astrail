import Link from "next/link";
import { Search } from "lucide-react";
import { ServerCard } from "@/components/ServerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { presetServers } from "@/lib/preset-servers";
import type { McpServer } from "@/lib/types";

function marketplaceCategory(server: McpServer) {
  return server.category ?? (server.source_type === "preset" ? "Template" : "Generated");
}

function categoryHref(category: string, search: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category !== "All") params.set("category", category);
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

function pageHref(page: number, search: string, category: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category !== "All") params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

const galleryPageSize = 12;

export default async function MarketplacePage(
  props: { searchParams?: Promise<{ search?: string; category?: string; page?: string }> }
) {
  const searchParams = await props.searchParams;
  const search = searchParams?.search?.trim().toLowerCase() ?? "";
  const selectedCategory = searchParams?.category?.trim() || "All";
  const currentPage = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);
  const allServers = presetServers;
  const categories = ["All", ...Array.from(new Set(allServers.map(marketplaceCategory))).sort((a, b) => a.localeCompare(b))];
  const servers = allServers.filter((server) => {
    const category = marketplaceCategory(server);
    const categoryMatches = selectedCategory === "All" || category === selectedCategory;
    if (!categoryMatches) return false;
    if (!search) return true;
    const toolText = JSON.stringify(server.tools_json ?? []).toLowerCase();
    return (
      server.name.toLowerCase().includes(search) ||
      category.toLowerCase().includes(search) ||
      (server.description ?? "").toLowerCase().includes(search) ||
      toolText.includes(search)
    );
  });
  const showFeatured = selectedCategory === "All" && !search;
  const featuredPresets = presetServers.slice(0, 5);
  const galleryServers = showFeatured
    ? servers.filter((server) => !featuredPresets.some((preset) => preset.id === server.id))
    : servers;
  const totalPages = Math.max(1, Math.ceil(galleryServers.length / galleryPageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedGalleryServers = galleryServers.slice((safePage - 1) * galleryPageSize, safePage * galleryPageSize);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="console-hero px-5 py-8 sm:px-9">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Marketplace</h1>
            <p className="mt-1.5 text-sm text-neutral-600">
              Install executable MCP connectors with deterministic provider mappings, or use templates for runtimes that require a local bridge.
            </p>
          </div>
          <form className="w-full lg:max-w-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                name="search"
                defaultValue={searchParams?.search ?? ""}
                placeholder="Search GitHub, Stripe, Slack, docs, payments..."
                className="h-11 rounded-full border-neutral-200/80 bg-white pl-11 text-sm"
              />
              {selectedCategory !== "All" && <input type="hidden" name="category" value={selectedCategory} />}
            </div>
          </form>
        </div>

        <div className="relative z-10 mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category}
              href={categoryHref(category, searchParams?.search ?? "")}
              className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
                category === selectedCategory
                  ? "bg-neutral-950 text-white"
                  : "border border-white/60 bg-white/75 text-neutral-600 backdrop-blur hover:bg-white hover:text-neutral-950"
              }`}
            >
              {category}
            </Link>
          ))}
        </div>
      </header>

      {showFeatured && (
        <section className="section-card">
          <div className="section-card-header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-950">Popular agent packages</h2>
              <p className="mt-0.5 text-xs text-neutral-400">Verified endpoint maps with explicit least-privilege auth requirements</p>
            </div>
            <span className="pill pill-brand">Featured</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredPresets.map((server) => (
              <ServerCard key={server.id} server={server} href={`/marketplace/${server.id}`} featured />
            ))}
          </div>
        </section>
      )}

      {galleryServers.length === 0 ? (
        <section className="section-card">
          <p className="text-sm text-neutral-500">No public servers found. Try a different search or category.</p>
        </section>
      ) : (
        <section className="section-card">
          <div className="section-card-header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-950">
                {selectedCategory === "All" ? "All available servers" : `${selectedCategory} servers`}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-400">
                {servers.length} matching listings
                {totalPages > 1 ? `, page ${safePage} of ${totalPages}` : ""}
              </p>
            </div>
            <span className="pill pill-neutral">Library</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedGalleryServers.map((server) => (
              <ServerCard key={server.id} server={server} href={`/marketplace/${server.id}`} />
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
              <span className="text-sm text-neutral-500">
                Showing {(safePage - 1) * galleryPageSize + 1}-{Math.min(safePage * galleryPageSize, galleryServers.length)} of {galleryServers.length}
              </span>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className={`bg-white ${safePage === 1 ? "pointer-events-none opacity-50" : ""}`}>
                  <Link href={pageHref(Math.max(1, safePage - 1), searchParams?.search ?? "", selectedCategory)} aria-disabled={safePage === 1}>
                    Previous
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className={`bg-white ${safePage === totalPages ? "pointer-events-none opacity-50" : ""}`}>
                  <Link href={pageHref(Math.min(totalPages, safePage + 1), searchParams?.search ?? "", selectedCategory)} aria-disabled={safePage === totalPages}>
                    Next
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
