import { NextResponse } from "next/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createDataClient } from "@/lib/neon/server";

export const runtime = "nodejs";

const maxLengths = {
  name: 120,
  email: 254,
  company: 160,
  role: 120,
  persona: 32,
  agent_kind: 1200,
  workflow_goal: 1600,
  needed_api: 1200,
  systems_involved: 1600,
  has_api_docs: 12,
  api_docs_url_or_notes: 2000,
  approval_steps: 1600,
  auth_constraints: 1600,
  runtime_preference: 32,
  urgency: 24,
};

const allowedPersonas = new Set(["buyer", "developer", "workflow_owner"]);
const allowedDocsAnswers = new Set(["yes", "no"]);
const allowedRuntimePreferences = new Set(["hosted", "exported_code", "self_hosted"]);
const allowedUrgencies = new Set(["today", "this_week", "exploring"]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = {
    name: clean(body.name, maxLengths.name),
    email: clean(body.email, maxLengths.email).toLowerCase(),
    company: clean(body.company, maxLengths.company),
    role: clean(body.role, maxLengths.role),
    persona: clean(body.persona, maxLengths.persona),
    agent_kind: clean(body.agent_kind, maxLengths.agent_kind),
    workflow_goal: clean(body.workflow_goal, maxLengths.workflow_goal),
    needed_api: clean(body.needed_api, maxLengths.needed_api),
    systems_involved: clean(body.systems_involved, maxLengths.systems_involved),
    has_api_docs: clean(body.has_api_docs, maxLengths.has_api_docs),
    api_docs_url_or_notes: clean(body.api_docs_url_or_notes, maxLengths.api_docs_url_or_notes),
    approval_steps: clean(body.approval_steps, maxLengths.approval_steps),
    auth_constraints: clean(body.auth_constraints, maxLengths.auth_constraints),
    runtime_preference: clean(body.runtime_preference, maxLengths.runtime_preference),
    urgency: clean(body.urgency, maxLengths.urgency),
    status: "new",
  };

  if (!payload.name || !payload.email || !payload.company || !payload.persona || !payload.agent_kind || !payload.workflow_goal || !payload.needed_api || !payload.systems_involved) {
    return NextResponse.json({ error: "Name, email, company, persona, agent type, workflow, systems, and needed API are required." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!allowedPersonas.has(payload.persona)) {
    return NextResponse.json({ error: "Choose whether you are a buyer, developer, or workflow owner." }, { status: 400 });
  }

  if (!allowedDocsAnswers.has(payload.has_api_docs)) {
    return NextResponse.json({ error: "Choose whether you have API docs, OpenAPI, Postman, sample cURL, or SDK information." }, { status: 400 });
  }

  if (!allowedRuntimePreferences.has(payload.runtime_preference)) {
    return NextResponse.json({ error: "Choose a runtime preference." }, { status: 400 });
  }

  if (!allowedUrgencies.has(payload.urgency)) {
    return NextResponse.json({ error: "Choose an urgency." }, { status: 400 });
  }

  if (!hasServerNeonEnv()) {
    return NextResponse.json({
      request: {
        id: `local_${Date.now()}`,
        created_at: new Date().toISOString(),
        preview: true,
      },
    });
  }

  try {
    const db = await createDataClient();
    const { data, error } = await db
      .from("design_partner_requests")
      .insert(payload)
      .select("id,created_at")
      .single();

    if (error) {
      const tableMissing = error.code === "42P01" || /does not exist|schema cache/i.test(error.message);
      return NextResponse.json(
        {
          error: tableMissing
            ? "Design partner intake is temporarily unavailable. Please contact hi@astrail.dev."
            : "Could not save the request yet.",
        },
        { status: tableMissing ? 503 : 500 },
      );
    }

    return NextResponse.json({ request: data });
  } catch {
    return NextResponse.json(
      { error: "Design partner intake is temporarily unavailable. Please contact hi@astrail.dev." },
      { status: 503 },
    );
  }
}

function clean(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}
