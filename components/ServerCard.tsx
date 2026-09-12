import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, KeyRound, PackagePlus, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { marketplaceBrand } from "@/lib/marketplace-branding";
import type { McpServer } from "@/lib/types";

export function ServerCard({ server, href, featured = false }: { server: McpServer; href?: string; featured?: boolean }) {
  const tools = server.tools_json ?? [];
  const status = server.status ?? (server.source_type === "preset" ? "preset" : "live");
  const category = server.category ?? (server.source_type === "preset" ? "Template" : "Generated");
  const brand = marketplaceBrand(server);
  const endpointMap = server.endpoint_map ?? [];
  const executable = endpointMap.some((endpoint) =>
    ["GET", "POST"].includes(endpoint.method) &&
    Boolean(endpoint.base_url) &&
    !endpoint.requires_auth
  );
  const runtimeLabel = server.source_type === "preset"
    ? "auth setup"
    : executable
      ? "REST runtime"
      : endpointMap.length > 0
        ? "mapped"
        : "metadata";
  const title = server.name.replace(/\s*MCP Template$/i, "");

  return (
    <Link
      href={href ?? `/dashboard/servers/${server.id}`}
      className="console-card group block h-full"
    >
      <div className="h-full rounded-2xl bg-white">
        <div className="flex h-full flex-col rounded-2xl bg-white p-5">
          <div className="flex items-start gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-neutral-200/70 bg-white">
              <span className="absolute text-xl font-semibold text-neutral-200">{title.charAt(0)}</span>
              <Image src={brand.icon} alt="" width={32} height={32} sizes="32px" loading={featured ? "eager" : "lazy"} className="relative object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold leading-6 text-neutral-950">{title}</h3>
                  <p className="mt-1 line-clamp-1 text-sm text-neutral-500">{brand.tagline}</p>
                </div>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-neutral-950" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="pill pill-neutral">{category}</span>
                <span className={status === "preset" ? "pill pill-brand" : "pill pill-success"}>
                  {status === "preset" ? "Verified template" : "Live endpoint"}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-neutral-600">
            {server.description ?? "Generated MCP server"}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-2">
              <div className="font-mono text-sm font-semibold text-neutral-950">{tools.length}</div>
              <div className="text-neutral-400">tools</div>
            </div>
            <div className="rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-2">
              <div className="font-mono text-sm font-semibold text-neutral-950">{server.call_count ?? 0}</div>
              <div className="text-neutral-400">calls</div>
            </div>
            <div className="rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-2">
              <div className="truncate text-sm font-semibold text-neutral-950">{runtimeLabel}</div>
              <div className="text-neutral-400">runtime</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200/80 bg-white px-2.5 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Public
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200/80 bg-white px-2.5 py-1">
              <KeyRound className="h-3.5 w-3.5 text-orange-500" />
              Bring credentials
            </span>
            {featured && (
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200/80 bg-white px-2.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-sky-600" />
                Featured
              </span>
            )}
          </div>

          <div className="mt-auto pt-5">
            <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
              <span className="text-xs text-neutral-400">Updated {formatDate(server.created_at)}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white transition group-hover:bg-neutral-800">
                <PackagePlus className="h-3.5 w-3.5" />
                Install
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
