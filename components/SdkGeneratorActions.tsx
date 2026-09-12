"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Code2, Globe2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  {
    href: "/dashboard/generate",
    label: "OpenAPI to SDK",
    loadingLabel: "Opening OpenAPI...",
    icon: Code2,
    variant: "outline" as const,
  },
  {
    href: "/dashboard/website-to-mcp",
    label: "Website to SDK",
    loadingLabel: "Opening website...",
    icon: Globe2,
    variant: "default" as const,
  },
];

export function SdkGeneratorActions() {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    actions.forEach((action) => router.prefetch(action.href));
  }, [router]);

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        const isPending = pendingHref === action.href;
        const disabled = pendingHref !== null;

        return (
          <Button
            key={action.href}
            type="button"
            variant={action.variant}
            disabled={disabled}
            aria-busy={isPending}
            className="min-w-[172px] justify-center"
            onClick={() => {
              if (pendingHrefRef.current) return;
              pendingHrefRef.current = action.href;
              setPendingHref(action.href);
              startTransition(() => router.push(action.href));
            }}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            {isPending ? action.loadingLabel : action.label}
          </Button>
        );
      })}
    </div>
  );
}
