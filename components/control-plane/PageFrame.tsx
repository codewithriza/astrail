import type { ReactNode } from "react";

export function PageFrame({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto max-w-7xl ${compact ? "space-y-4 pb-4" : "space-y-6 pb-10"}`}>
      <header className={`flex flex-col gap-4 border-b border-neutral-200 lg:flex-row lg:items-end lg:justify-between ${compact ? "pb-4" : "pb-6"}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">{eyebrow}</p>
          <h1 className={`${compact ? "mt-1 text-2xl" : "mt-2 text-3xl"} font-semibold tracking-tight text-neutral-950`}>{title}</h1>
          <p className={`${compact ? "mt-1 leading-5" : "mt-2 leading-6"} max-w-3xl text-sm text-neutral-600`}>{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function StatStrip({ items }: { items: Array<{ label: string; value: string | number; note?: string }> }) {
  return (
    <div className="grid overflow-hidden rounded-xl border border-neutral-200 bg-white md:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.label} className={`p-5 ${index ? "border-t border-neutral-200 md:border-l md:border-t-0" : ""}`}>
          <p className="text-sm text-neutral-500">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{item.value}</p>
          {item.note ? <p className="mt-1 text-xs text-neutral-500">{item.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function WarningBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {warnings.join(" ")}
    </div>
  );
}
