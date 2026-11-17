"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-6xl justify-center py-10">
      <div className="section-card max-w-md text-center">
        <h2 className="text-lg font-semibold text-neutral-950">Workspace is loading</h2>
        <p className="mt-1.5 text-sm text-neutral-500">
          We could not load your workspace yet. Refresh once; if it still fails, sign in again.
        </p>
        <Button className="mt-5" onClick={reset}>Refresh workspace</Button>
      </div>
    </div>
  );
}
