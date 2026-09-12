function SkeletonRow() {
  return (
    <div className="console-table-row flex items-center justify-between gap-4 py-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-neutral-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <span className="block h-3.5 w-1/3 animate-pulse rounded-full bg-neutral-100" />
          <span className="block h-3 w-1/2 animate-pulse rounded-full bg-neutral-100/70" />
        </div>
      </div>
      <span className="h-3.5 w-16 shrink-0 animate-pulse rounded-full bg-neutral-100" />
    </div>
  );
}

function SkeletonSection({ title }: { title: string }) {
  return (
    <section className="section-card" aria-hidden>
      <div className="section-card-header">
        <h2 className="text-lg font-semibold text-neutral-950">{title}</h2>
        <span className="h-7 w-24 animate-pulse rounded-full bg-neutral-100" />
      </div>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </section>
  );
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5" aria-busy="true" aria-live="polite">
      <header className="console-hero px-5 pb-7 pt-9 sm:px-9 sm:pb-8 sm:pt-12">
        <div className="relative z-10">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
            Loading your workspace... <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-600">Take a look into your workspace</p>
          <div className="mt-8">
            <p className="text-sm font-medium text-neutral-500">Important Actions</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[0, 1].map((index) => (
                <div key={index} className="flex items-center gap-3.5 rounded-2xl border border-white/60 bg-white/75 p-3.5">
                  <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-neutral-100" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3.5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
                    <span className="block h-3 w-1/3 animate-pulse rounded-full bg-neutral-100/70" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <SkeletonSection title="Endpoints" />
      <SkeletonSection title="Build" />
      <SkeletonSection title="Usage & Analytics" />
    </div>
  );
}
