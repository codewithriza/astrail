import { DashboardTopbar } from "@/components/DashboardTopbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash-shell min-h-dvh bg-[#f8f6f1] text-neutral-950">
      <style>{`
        html,
        body {
          background: #f8f6f1;
          overscroll-behavior-y: none;
        }
      `}</style>
      <DashboardTopbar />
      <main className="mx-auto min-h-dvh w-full max-w-[1400px] overflow-x-hidden px-4 pb-16 pt-6 sm:px-6 md:pt-8">
        {children}
      </main>
    </div>
  );
}
