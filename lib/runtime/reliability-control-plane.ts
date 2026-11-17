import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";

export type ReliabilityDimension = { tenantId: string; provider: string; credentialId: string | null };
export type ReliabilityPermit = { allowed: boolean; reason: "ready" | "throttled" | "circuit_open" | "queue_full" | "deadline"; retryAt: string | null; queuedMs: number };

const MAX_QUEUE_WAIT_MS = 5_000;
const MAX_QUEUE_POLLS = 10;
const localRetryBudgets = new Map<string, { remaining: number; resetAt: number }>();

function key(input: ReliabilityDimension) { return `${input.tenantId}:${input.provider}:${input.credentialId ?? "shared"}`; }

export function consumeLocalRetryBudget(input: ReliabilityDimension, now = Date.now()) {
  const budgetKey = key(input); const current = localRetryBudgets.get(budgetKey);
  if (!current || current.resetAt <= now) { localRetryBudgets.set(budgetKey, { remaining: 19, resetAt: now + 60_000 }); return true; }
  if (current.remaining <= 0) return false;
  current.remaining -= 1; return true;
}
export async function consumeProviderRetryBudget(input:ReliabilityDimension){
 if(!hasServiceRoleKey())return consumeLocalRetryBudget(input);
 const {data,error}=await createAdminClient().rpc("consume_provider_retry_budget",{p_tenant_id:input.tenantId,p_provider:input.provider,p_credential_id:input.credentialId});
 return error?.message.includes("consume_provider_retry_budget")?consumeLocalRetryBudget(input):data===true;
}
export async function recordProviderOutcome(input:ReliabilityDimension,success:boolean){
 if(!hasServiceRoleKey())return;
 await createAdminClient().rpc("record_provider_outcome",{p_tenant_id:input.tenantId,p_provider:input.provider,p_credential_id:input.credentialId,p_success:success});
}

export async function acquireReliabilityPermit(input: ReliabilityDimension, deadlineMs = Date.now() + MAX_QUEUE_WAIT_MS, signal?: AbortSignal): Promise<ReliabilityPermit> {
  if (!hasServiceRoleKey()) return { allowed: true, reason: "ready", retryAt: null, queuedMs: 0 };
  const started = Date.now();
  for (let poll = 0; poll < MAX_QUEUE_POLLS; poll += 1) {
    if (signal?.aborted) return { allowed:false,reason:"deadline",retryAt:null,queuedMs:Date.now()-started };
    const { data, error } = await createAdminClient().rpc("acquire_provider_permit", {
      p_tenant_id: input.tenantId, p_provider: input.provider, p_credential_id: input.credentialId,
      p_deadline: new Date(deadlineMs).toISOString(),
    });
    if (error?.message.includes("acquire_provider_permit")) return { allowed: true, reason: "ready", retryAt: null, queuedMs: Date.now() - started };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed) return { allowed: true, reason: "ready", retryAt: null, queuedMs: Date.now() - started };
    const reason = row?.reason as ReliabilityPermit["reason"] | undefined;
    if (reason === "circuit_open" || reason === "queue_full") return { allowed: false, reason, retryAt: row?.retry_at ?? null, queuedMs: Date.now() - started };
    if (Date.now() >= deadlineMs) return { allowed: false, reason: "deadline", retryAt: null, queuedMs: Date.now() - started };
    await new Promise<void>((resolve) => { const timer=setTimeout(resolve,Math.min(500,Math.max(25,Number(row?.retry_after_ms)||100))); signal?.addEventListener("abort",()=>{clearTimeout(timer);resolve();},{once:true}); });
  }
  return { allowed: false, reason: "deadline", retryAt: null, queuedMs: Date.now() - started };
}

export async function recordReliabilityMetric(input: ReliabilityDimension, metric: "retry" | "throttle" | "queue" | "circuit" | "provider_error", value = 1) {
  if (!hasServiceRoleKey()) return;
  await createAdminClient().rpc("record_reliability_metric", { p_tenant_id: input.tenantId, p_provider: input.provider, p_credential_id: input.credentialId, p_metric: metric, p_value: value });
}

export function resetReliabilityBudgetsForTests() { localRetryBudgets.clear(); }
