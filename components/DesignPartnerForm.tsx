"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormStatus = {
  tone: "idle" | "success" | "error";
  message: string;
};

const initialStatus: FormStatus = {
  tone: "idle",
  message: "Do not paste API keys, bearer tokens, passwords, or private credentials.",
};

export function DesignPartnerForm() {
  const [status, setStatus] = useState<FormStatus>(initialStatus);
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(initialStatus);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/design-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Could not save the request yet.");
      }

      form.reset();
      setStatus({
        tone: "success",
        message: "Request received. We will review the workflow/API and follow up with next steps.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save the request yet.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitRequest} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" placeholder="Your name" required />
        <Field id="email" label="Email" type="email" placeholder="you@company.com" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="company" label="Company" placeholder="Company name" required />
        <Field id="role" label="Role" placeholder="Founder, engineer, product, etc." />
      </div>

      <SelectField id="persona" label="Are you a buyer, developer, or workflow owner?" required>
        <option value="">Select one</option>
        <option value="buyer">Buyer / budget owner</option>
        <option value="developer">Developer / integration owner</option>
        <option value="workflow_owner">Workflow owner</option>
      </SelectField>

      <TextAreaField
        id="agent_kind"
        label="What kind of agent are you building?"
        placeholder="Support agent, sales agent, internal ops agent, coding agent, onboarding agent..."
        required
      />

      <TextAreaField
        id="workflow_goal"
        label="What workflow do you want agents to perform?"
        placeholder="Refund a customer, create a purchase order, approve invoice, escalate ticket, update account status..."
        required
      />

      <TextAreaField
        id="needed_api"
        label="What API/tool does your agent need to call?"
        placeholder="Private API, internal admin tool, customer-specific SaaS integration, ERP, CRM, ticketing system..."
        required
      />

      <TextAreaField
        id="systems_involved"
        label="Which systems are involved?"
        placeholder="ERP, CRM, ticketing, Slack, email, database, internal API, accounting, inventory, warehouse system..."
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="has_api_docs" label="Do you have API docs/OpenAPI/Postman/sample cURL/SDK?" required>
          <option value="">Select one</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </SelectField>
        <SelectField id="runtime_preference" label="Preferred runtime" required>
          <option value="">Select one</option>
          <option value="hosted">Hosted by Astrail</option>
          <option value="exported_code">Exported code</option>
          <option value="self_hosted">Self-hosted</option>
        </SelectField>
      </div>

      <TextAreaField
        id="api_docs_url_or_notes"
        label="API docs URL or notes"
        placeholder="Paste docs/OpenAPI URL, Postman collection notes, SDK/sample cURL info, or describe where existing integrations live. Do not include secrets."
      />

      <TextAreaField
        id="approval_steps"
        label="Are there approval steps? Who approves?"
        placeholder="Manager approval above $5k, finance approval before refund, human review before purchase order..."
      />

      <TextAreaField
        id="auth_constraints"
        label="What auth/permission constraints exist?"
        placeholder="Role-based permissions, customer tenant boundaries, API keys, OAuth, service accounts, audit requirements..."
      />

      <SelectField id="urgency" label="Urgency" required>
        <option value="">Select one</option>
        <option value="today">Today</option>
        <option value="this_week">This week</option>
        <option value="exploring">Exploring</option>
      </SelectField>

      <div
        className={[
          "border p-3 text-sm",
          status.tone === "success" ? "border-green-200 bg-green-50 text-green-800" : "",
          status.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "",
          status.tone === "idle" ? "bg-muted text-muted-foreground" : "",
        ].join(" ")}
      >
        {status.message}
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Sending..." : "Send design partner request"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  type = "text",
  placeholder,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} placeholder={placeholder} required={required} />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={id} placeholder={placeholder} required={required} />
    </div>
  );
}

function SelectField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={id}
        required={required}
        className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {children}
      </select>
    </div>
  );
}
