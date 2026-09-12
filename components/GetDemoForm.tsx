"use client";

import { FormEvent, useState } from "react";
import { readJsonResponse } from "@/lib/client-json";

type FormStatus = {
  tone: "idle" | "success" | "error";
  message: string;
};

const initialStatus: FormStatus = {
  tone: "idle",
  message: "",
};

const engineerOptions = [
  ["engineering", "Yes, Please"],
  ["strategy", "Just Sales/Strategy is Fine"],
  ["other", "Other"],
];

const goalOptions = [
  ["third_party", "Connect My AI Product to Third-party Apps and APIs"],
  ["safe_mcp", "Give My Team Safe Access to MCPs in Claude, Cursor, etc."],
  ["other", "Other"],
];

export function GetDemoForm() {
  const [status, setStatus] = useState<FormStatus>(initialStatus);
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(initialStatus);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const goal = String(formData.get("goal") || "");
    const engineer = String(formData.get("engineer") || "");

    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      company: "Unknown company",
      role: "Demo request",
      persona: engineer === "engineering" ? "developer" : "buyer",
      agent_kind: "Astrail demo request for AI agents using MCP tools.",
      workflow_goal: goal,
      needed_api: goal || "MCP endpoint generation and hosted gateway",
      systems_involved: "APIs, websites, Claude, Cursor, Codex, and internal tools",
      has_api_docs: "yes",
      api_docs_url_or_notes: goal,
      approval_steps: engineer,
      auth_constraints: "To be discussed during demo.",
      runtime_preference: "hosted",
      urgency: "this_week",
    };

    try {
      const response = await fetch("/api/design-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(data.error ?? "Could not submit the request yet.");
      }

      form.reset();
      setStatus({
        tone: "success",
        message: "Request received. We will route it to the right team.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not submit the request yet.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitRequest} className="space-y-8">
      <Field id="name" label="Name (required)" placeholder="Your name" required />
      <Field id="email" label="Work email (required)" type="email" placeholder="you@company.com" required helper="Use your company email so we can route the request." />

      <RadioGroup label="Want to talk to an engineer? (optional)" name="engineer" options={engineerOptions} />

      <RadioGroup label="What do you want to get done with Astrail? (required)" name="goal" options={goalOptions} required />

      {status.message && (
        <div
          className={[
            "border px-4 py-3 text-sm leading-5",
            status.tone === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "",
            status.tone === "error" ? "border-red-300 bg-red-50 text-red-700" : "",
          ].join(" ")}
        >
          {status.message}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-16 w-full bg-black px-4 pixel-text text-base uppercase tracking-[0.08em] text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Submitting" : "Submit"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  type = "text",
  placeholder,
  helper,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  helper?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="pixel-text block text-sm uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        required={required}
        className="h-16 w-full border border-neutral-200 bg-white px-5 text-xl text-black outline-none transition placeholder:text-neutral-300 focus:border-neutral-500"
      />
      {helper && <p className="text-base leading-6 text-neutral-400">{helper}</p>}
    </div>
  );
}

function RadioGroup({ label, name, options, required }: { label: string; name: string; options: string[][]; required?: boolean }) {
  return (
    <fieldset className="space-y-3">
      <legend className="pixel-text mb-3 text-sm uppercase tracking-[0.14em] text-neutral-400">{label}</legend>
      <div className="grid gap-3">
        {options.map(([value, text], index) => (
          <label
            key={value}
            className="grid min-h-14 cursor-pointer grid-cols-[24px_1fr] items-center gap-4 border border-neutral-200 bg-white px-5 py-4 text-black transition hover:border-neutral-400"
          >
            <input
              type="radio"
              name={name}
              value={value}
              required={required && index === 0}
              className="h-5 w-5 appearance-none rounded-full border border-neutral-400 bg-white checked:border-black checked:bg-black"
            />
            <span className="text-xl font-medium leading-6">{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
