import type { ExecutionPolicy } from "@/lib/types";

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

export function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

export type NormalizedExecutionPolicy = {
  maxAttempts: number;
  timeoutMs: number;
  baseDelayMs: number;
  retryStatuses: Set<number>;
  retryWrites: boolean;
  idempotencyHeader: string;
};

export function normalizeExecutionPolicy(policy?: ExecutionPolicy | null): NormalizedExecutionPolicy {
  const statuses = Array.isArray(policy?.retry_statuses)
    ? policy.retry_statuses.map(Number).filter((status) => Number.isInteger(status) && isRetryableStatus(status)).slice(0, 30)
    : DEFAULT_RETRY_STATUSES;
  const header = typeof policy?.idempotency_header === "string" && /^[a-z0-9-]{1,80}$/i.test(policy.idempotency_header)
    ? policy.idempotency_header
    : "idempotency-key";
  return {
    maxAttempts: integer(policy?.max_attempts, 3, 1, 4),
    timeoutMs: integer(policy?.timeout_ms, 15_000, 1_000, 30_000),
    baseDelayMs: integer(policy?.base_delay_ms, 300, 0, 2_000),
    retryStatuses: new Set(statuses.length > 0 ? statuses : DEFAULT_RETRY_STATUSES),
    retryWrites: policy?.retry_writes === true,
    idempotencyHeader: header,
  };
}

export function retryDelayMs(policy: NormalizedExecutionPolicy, attempt: number, retryAfter: string | null, random = Math.random) {
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(5_000, Math.round(retryAfterSeconds * 1000));
  }
  const ceiling = Math.min(5_000, policy.baseDelayMs * (2 ** Math.max(0, attempt - 1)));
  return Math.min(ceiling, Math.floor(Math.max(0, Math.min(1, random())) * (ceiling + 1)));
}

export async function waitBeforeRetry(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
