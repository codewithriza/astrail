import { createAdminClient, hasServiceRoleKey } from "../neon/server";
import { createHash, randomUUID } from "crypto";
import type { McpServer, OpenApiEndpoint } from "../types";
import type { ToolExecutionResult } from "./execute-tool";

// Outbound tool-call idempotency: when an agent retries a write after an
// ambiguous failure (timeout, dropped connection), the same idempotency key
// must not create the action twice. Successful executions are recorded keyed
// on (server, tool, idempotency_key) and replayed on duplicates. Durable when
// Neon is configured; an in-memory fallback covers preview deployments.

const KEY_ARGUMENT_NAMES = ["idempotency_key", "idempotencyKey"];
const MAX_KEY_LENGTH = 256;
const MAX_STORED_RESULT_BYTES = 100_000;
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 2_000;

export type RecordedExecution = {
  resultText: string;
  traceId: string | null;
  recordedAt: string;
};

type MemoryEntry = RecordedExecution & { expiresAt: number };

const memoryStore = new Map<string, MemoryEntry>();
const memoryClaims = new Map<string, { token: string; expiresAt: number }>();
const CLAIM_LEASE_MS = 5 * 60 * 1000;

export type ToolExecutionClaim =
  | { status: "claimed"; claimToken: string }
  | { status: "in_progress" }
  | { status: "in_doubt" }
  | { status: "unavailable" }
  | { status: "replay"; recorded: RecordedExecution };

export function extractIdempotencyKey(args: Record<string, unknown>): string | null {
  for (const name of KEY_ARGUMENT_NAMES) {
    const value = args[name];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed.length <= MAX_KEY_LENGTH) return trimmed;
    }
  }
  return null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, nested]) => [name, stableValue(nested)]));
  }
  return value;
}

export function idempotencyAuthorizationFingerprint(
  endpoint: OpenApiEndpoint | null | undefined,
  toolPolicy: unknown,
  runtimePolicy: unknown,
) {
  let baseUrl = endpoint?.base_url ?? null;
  try {
    baseUrl = baseUrl ? new URL(baseUrl).toString() : null;
  } catch {
    // Preserve the invalid value so a later correction changes the fingerprint.
  }
  return createHash("sha256").update(JSON.stringify(stableValue({
    method: endpoint?.method ?? null,
    path: endpoint?.path ?? null,
    base_url: baseUrl,
    static_headers: endpoint?.static_headers ?? null,
    oauth_security_bindings: endpoint?.oauth_security_bindings ?? null,
    tool_policy: toolPolicy,
    runtime_policy: runtimePolicy,
  }))).digest("hex");
}

export function scopeIdempotencyKey(key: string, endUserId: string | null, actorRole: string | null, authorizationFingerprint = "") {
  return createHash("sha256")
    .update(JSON.stringify([key, endUserId, actorRole, authorizationFingerprint]))
    .digest("hex");
}

function memoryKey(server: McpServer, toolName: string, key: string) {
  return `${server.id}:${toolName}:${key}`;
}

function pruneMemoryStore(now: number) {
  for (const [key, entry] of Array.from(memoryStore.entries())) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }
  while (memoryStore.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryStore.keys().next().value;
    if (oldest === undefined) break;
    memoryStore.delete(oldest);
  }
  for (const [key, claim] of Array.from(memoryClaims.entries())) {
    if (claim.expiresAt <= now) memoryClaims.delete(key);
  }
}

export async function claimToolExecution(server: McpServer, toolName: string, key: string): Promise<ToolExecutionClaim> {
  const claimToken = randomUUID();
  if (hasServiceRoleKey()) {
    try {
      const { data, error } = await createAdminClient().rpc("claim_tool_execution", {
        p_server_id: server.id,
        p_user_id: server.user_id,
        p_tool_name: toolName,
        p_idempotency_key: key,
        p_claim_token: claimToken,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row?.claim_status === "claimed") return { status: "claimed", claimToken: typeof row.owner_token === "string" ? row.owner_token : claimToken };
      if (!error && row?.claim_status === "in_progress") return { status: "in_progress" };
      if (!error && row?.claim_status === "in_doubt") return { status: "in_doubt" };
      if (!error && row?.claim_status === "replay") {
        return {
          status: "replay",
          recorded: {
            resultText: typeof row.result_text === "string" ? row.result_text : JSON.stringify({ status: "success", replay_unavailable: true, note: "The original write succeeded, but its response was too large to retain." }),
            traceId: typeof row.trace_id === "string" ? row.trace_id : null,
            recordedAt: typeof row.recorded_at === "string" ? row.recorded_at : new Date().toISOString(),
          },
        };
      }
      return { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  }

  const now = Date.now();
  pruneMemoryStore(now);
  const storeKey = memoryKey(server, toolName, key);
  const recorded = memoryStore.get(storeKey);
  if (recorded && recorded.expiresAt > now) {
    return { status: "replay", recorded: { resultText: recorded.resultText, traceId: recorded.traceId, recordedAt: recorded.recordedAt } };
  }
  const activeClaim = memoryClaims.get(storeKey);
  if (activeClaim && activeClaim.expiresAt > now) return { status: "in_progress" };
  memoryClaims.set(storeKey, { token: claimToken, expiresAt: now + CLAIM_LEASE_MS });
  return { status: "claimed", claimToken };
}

export async function releaseToolExecutionClaim(server: McpServer, toolName: string, key: string, claimToken: string) {
  if (hasServiceRoleKey()) {
    const { error } = await createAdminClient().from("tool_execution_dedup").update({
      status: "failed",
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("server_id", server.id).eq("tool_name", toolName).eq("idempotency_key", key).eq("status", "pending").eq("claim_token", claimToken);
    if (error) throw new Error("Could not release the durable idempotency claim.");
    return;
  }
  const storeKey = memoryKey(server, toolName, key);
  if (memoryClaims.get(storeKey)?.token === claimToken) memoryClaims.delete(storeKey);
}

export async function findRecordedToolExecution(
  server: McpServer,
  toolName: string,
  key: string
): Promise<RecordedExecution | null> {
  if (hasServiceRoleKey()) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("tool_execution_dedup")
        .select("result_text,trace_id,created_at")
        .eq("server_id", server.id)
        .eq("tool_name", toolName)
        .eq("idempotency_key", key)
        .limit(1)
        .maybeSingle();
      if (!error && data && typeof data.result_text === "string") {
        return {
          resultText: data.result_text,
          traceId: typeof data.trace_id === "string" ? data.trace_id : null,
          recordedAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
        };
      }
      if (!error) return null;
      if (!error.message.includes("tool_execution_dedup") && !error.message.includes("column")) return null;
      // Table missing (migration not run): fall through to the memory store.
    } catch {
      // Dedup lookup is best-effort; fall through to the memory store.
    }
  }

  const now = Date.now();
  pruneMemoryStore(now);
  const entry = memoryStore.get(memoryKey(server, toolName, key));
  if (!entry || entry.expiresAt <= now) return null;
  return { resultText: entry.resultText, traceId: entry.traceId, recordedAt: entry.recordedAt };
}

export async function toolExecutionKeyExists(server: McpServer, toolName: string, key: string) {
  if (hasServiceRoleKey()) {
    try {
      const { data, error } = await createAdminClient().from("tool_execution_dedup")
        .select("id")
        .eq("server_id", server.id)
        .eq("tool_name", toolName)
        .eq("idempotency_key", key)
        .limit(1)
        .maybeSingle();
      if (!error) return Boolean(data);
      if (!error.message.includes("tool_execution_dedup") && !error.message.includes("column")) return true;
    } catch {
      return true;
    }
  }
  const storeKey = memoryKey(server, toolName, key);
  return memoryStore.has(storeKey) || memoryClaims.has(storeKey);
}

export async function recordToolExecution(
  server: McpServer,
  toolName: string,
  key: string,
  execution: ToolExecutionResult,
  claimToken: string,
): Promise<void> {
  if (execution.status !== "success" && execution.attemptCount === 0) return;
  const rawResultText = execution.mcpResult.content[0]?.text ?? "";
  const resultText = rawResultText && Buffer.byteLength(rawResultText, "utf8") <= MAX_STORED_RESULT_BYTES
    ? rawResultText
    : JSON.stringify({ status: execution.status, replay_unavailable: true, note: "The original upstream attempt completed, but its response was empty or too large to retain. Astrail will not repeat the write." });

  const recordedAt = new Date().toISOString();
  if (hasServiceRoleKey()) {
    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin.from("tool_execution_dedup").update({
        status: "succeeded",
        trace_id: execution.traceId,
        result_text: resultText,
        claim_token: null,
        lease_expires_at: null,
        updated_at: recordedAt,
      }).eq("server_id", server.id).eq("tool_name", toolName).eq("idempotency_key", key).eq("status", "pending").eq("claim_token", claimToken).select("id").maybeSingle();
    if (updateError || !updated) throw new Error("Could not persist the durable idempotent execution result.");
    return;
  }

  pruneMemoryStore(Date.now());
  const storeKey = memoryKey(server, toolName, key);
  const currentClaim = memoryClaims.get(storeKey);
  if (currentClaim && currentClaim.token !== claimToken) return;
  memoryStore.set(storeKey, {
    resultText,
    traceId: execution.traceId,
    recordedAt,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
  if (memoryClaims.get(storeKey)?.token === claimToken) memoryClaims.delete(storeKey);
}

export function replayedExecutionResult(
  toolName: string,
  key: string,
  recorded: RecordedExecution
): ToolExecutionResult {
  const traceId = `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  let payload: unknown;
  try {
    payload = JSON.parse(recorded.resultText);
  } catch {
    payload = recorded.resultText;
  }
  const replayWasError = Boolean(payload && typeof payload === "object" && (payload as { status?: unknown }).status === "error");

  const wrapped = {
    status: replayWasError ? "error" : "success",
    tool: toolName,
    replayed: true,
    idempotency: {
      idempotency_key: key,
      original_trace_id: recorded.traceId,
      recorded_at: recorded.recordedAt,
      note: "This idempotency key already executed successfully. Astrail replayed the recorded result instead of calling the upstream API again.",
    },
    original_result: payload,
    runtime: {
      execution_mode: "idempotent_replay",
      trace_id: traceId,
    },
  };

  return {
    mcpResult: { ...(replayWasError ? { isError: true } : {}), content: [{ type: "text", text: JSON.stringify(wrapped, null, 2) }] },
    status: replayWasError ? "error" : "success",
    latencyMs: 0,
    method: null,
    path: null,
    executionMode: "safe_rest_execution",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: replayWasError ? "idempotent_replay_of_error" : null,
    error: replayWasError ? "The original idempotent upstream attempt failed or had an ambiguous result; Astrail did not repeat the write." : null,
  };
}

export function resetIdempotencyMemoryForTests() {
  memoryStore.clear();
  memoryClaims.clear();
}
