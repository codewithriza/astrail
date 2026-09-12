import Link from "next/link";
import { AstrailLogo } from "@/components/AstrailLogo";

const inputs = [
  ["Third-party SaaS", "Slack, Google, GitHub, HubSpot"],
  ["Your tool contract", "the model-facing shape you actually want"],
  ["API contract", "OpenAPI, GraphQL, or existing MCP"],
];

const outputs = [
  ["per-user oauth", "separate encrypted provider grants"],
  ["scope checks", "fail closed before provider execution"],
  ["token lifecycle", "refresh, rotation, and reconnect state"],
  ["tools/call", "deterministic policy-controlled execution"],
  ["audit logs", "identity, status, latency, and trace"],
];

function WorkflowPanel() {
  return (
    <div className="relative w-full max-w-4xl">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(9,9,11,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(9,9,11,0.05)_1px,transparent_1px)] bg-[size:92px_92px]" />
      <div className="relative border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <p className="pixel-text text-xs uppercase tracking-[0.16em] text-neutral-400">Astrail workflow</p>
            <h2
              className="mt-4 max-w-xl text-4xl font-normal leading-tight tracking-normal text-black"
              style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
            >
              From provider consent to one secure agent endpoint.
            </h2>
          </div>
          <div className="hidden border border-neutral-200 bg-[#fafafa] px-4 py-3 font-mono text-xs text-neutral-500 xl:block">
            endpoint_map<br />
            code_mode<br />
            tools_json<br />
            hosted_gateway
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_auto_1.05fr]">
          <div className="grid gap-3">
            {inputs.map(([title, body], index) => (
              <div key={title} className="grid grid-cols-[44px_1fr] border border-neutral-200 bg-white">
                <div className="grid place-items-center border-r border-neutral-200 font-mono text-xs text-[#4F46E5]">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="p-4">
                  <p className="font-semibold text-black">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-neutral-500">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden min-h-full w-28 items-center justify-center xl:flex">
            <div className="h-px w-full bg-neutral-300" />
          </div>

          <div className="border border-neutral-200 bg-[#111111] p-5 text-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <span className="grid h-10 w-10 place-items-center border border-white/15 bg-white text-black font-mono text-sm font-black">A</span>
              <div>
                <p className="font-semibold">Astrail Runtime</p>
                <p className="font-mono text-xs text-white/38">securing agent access</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {outputs.map(([title, body], index) => (
                <div key={title} className="grid grid-cols-[40px_1fr] border border-white/10 bg-white/[0.035]">
                  <div className="grid place-items-center border-r border-white/10 font-mono text-xs text-white/55">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="p-3">
                    <p className="font-mono text-sm text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/40">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 border border-white/10 bg-white/[0.035] p-4">
              <p className="pixel-text text-[10px] uppercase tracking-[0.16em] text-white/38">Endpoint</p>
              <code className="mt-2 block break-all font-mono text-sm text-white">mcp://astrail/workspace</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="grid min-h-screen lg:grid-cols-[40%_60%]">
        <div className="flex min-h-[52vh] flex-col border-r border-neutral-200 px-6 py-14 lg:min-h-screen lg:px-20">
          <div className="mx-auto flex w-full max-w-[420px] flex-col items-center">
            <div className="mt-auto flex w-full flex-col items-center pb-12">
              <AstrailLogo markClassName="h-14 w-14" labelClassName="text-4xl" />
              <p className="mt-5 max-w-sm text-center text-base leading-6 text-neutral-500">
                Connect third-party SaaS per user, or bring the tool contract your agent should actually see.
              </p>
            </div>
            <div className="grid w-full gap-3">
              <Link
                href="/dashboard/integrations"
                className="flex h-14 w-full items-center justify-center bg-black px-5 text-base font-semibold text-white transition hover:bg-neutral-800"
              >
                Connect a SaaS provider
              </Link>
              <Link
                href="/dashboard/generate"
                className="flex h-14 w-full items-center justify-center border border-neutral-300 bg-white px-5 text-base font-semibold text-black transition hover:border-black hover:bg-neutral-50"
              >
                Generate from an API contract
              </Link>
            </div>
            <div className="mt-5 grid w-full gap-2 lg:hidden">
              {outputs.map(([title, body]) => (
                <div key={title} className="grid grid-cols-[96px_1fr] border border-neutral-200 bg-neutral-50 px-3 py-2 text-left">
                  <span className="font-mono text-xs text-black">{title}</span>
                  <span className="text-xs leading-5 text-neutral-500">{body}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mx-auto mt-auto max-w-[420px] pt-20 text-center text-sm leading-6 text-neutral-500 lg:pt-0">
            By continuing, you agree to Astrail&apos;s{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-black">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-black">Privacy Policy</Link>.
          </p>
        </div>

        <div className="relative hidden min-h-screen overflow-hidden bg-[#f5f5f5] lg:block">
          <div className="relative z-10 flex min-h-screen items-center justify-center px-16">
            <WorkflowPanel />
          </div>
        </div>
      </section>
    </main>
  );
}
