import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AstrailLogo } from "@/components/AstrailLogo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-[#f7f7f5] px-3 py-3">
      <div className="mx-auto flex h-16 max-w-[1720px] items-center justify-between border border-neutral-200 bg-white px-4 sm:px-6">
        <AstrailLogo markClassName="h-8 w-8" labelClassName="text-[26px] font-black" />
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-[13px] font-semibold uppercase tracking-normal text-neutral-950 shadow-sm transition hover:border-orange-300 hover:text-orange-700 sm:px-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>
    </header>
  );
}
