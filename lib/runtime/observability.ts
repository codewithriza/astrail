type StructuredLogPrimitive = string | number | boolean | null;
type StructuredLogValue = StructuredLogPrimitive | StructuredLogValue[] | { [key: string]: StructuredLogValue };

const REDACTED = "[redacted]";
const MAX_LOG_STRING_LENGTH = 2_048;
const MAX_LOG_DEPTH = 8;

const SENSITIVE_KEY_PATTERN =
  /(^|[-_\s])(api[-_]?key|assertion|authorization|bearer|client[-_]?secret|cookie|credential|jwt|password|private[-_]?key|refresh[-_]?token|secret|session|signature|token)([-_\s]|$)/i;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[-_]?key|access[-_]?token|authorization|bearer|client[-_]?secret|cookie|credential|password|private[-_]?key|refresh[-_]?token|secret|session|signature|token)\s*[:=]\s*["']?([^&\s"',}]+)/gi;
const SECRET_QUERY_PATTERN =
  /([?&](?:api[-_]?key|access[-_]?token|authorization|bearer|client[-_]?secret|cookie|credential|password|private[-_]?key|refresh[-_]?token|secret|session|signature|token)=)([^&#\s]+)/gi;
const COMMON_SECRET_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[0-9A-Za-z_-]{16,})\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g;

function isSensitiveLogKey(key: string) {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return SENSITIVE_KEY_PATTERN.test(normalized);
}

function truncateLogString(value: string) {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[truncated]`;
}

export function redactLogText(value: string) {
  return truncateLogString(value)
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key) => `${key}=[redacted]`)
    .replace(SECRET_QUERY_PATTERN, (_match, prefix) => `${prefix}${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(COMMON_SECRET_PATTERN, REDACTED);
}

export function sanitizeStructuredLog<T>(value: T, seen = new WeakSet<object>(), depth = 0): T {
  if (typeof value === "string") return redactLogText(value) as T;
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (typeof value !== "object") return String(value) as T;
  if (seen.has(value)) return "[circular]" as T;
  if (depth >= MAX_LOG_DEPTH) return "[max_depth]" as T;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredLog(item, seen, depth + 1)) as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveLogKey(key)
      ? REDACTED
      : sanitizeStructuredLog(nested, seen, depth + 1);
  }
  return output as T;
}

export function writeStructuredLog(payload: Record<string, unknown>) {
  console.info(JSON.stringify(sanitizeStructuredLog(payload) as StructuredLogValue));
}

export function sanitizeToolLogRecord<T extends Record<string, unknown>>(record: T): T {
  return sanitizeStructuredLog(record);
}

const MAX_LOGGED_ARGUMENT_BYTES = 4_000;

export function redactedArgumentsForLog(args: Record<string, unknown> | null | undefined) {
  if (!args || Object.keys(args).length === 0) return null;
  // Unknown providers can place opaque tokens under arbitrary field names.
  // Persist names only: heuristic value redaction can never prove a value is
  // safe, while argument names are enough to reconstruct what shape was sent.
  const argumentNames = Object.keys(args).slice(0, 50);
  return {
    argument_names: argumentNames,
    values_omitted: true,
    truncated: Object.keys(args).length > argumentNames.length || JSON.stringify(argumentNames).length > MAX_LOGGED_ARGUMENT_BYTES,
  };
}

type ToolExecutionForSummary = {
  status: string;
  method: string | null;
  path: string | null;
  latencyMs: number;
  upstreamStatus: number | null;
  attemptCount: number;
  errorCode: string | null;
};

// A single sentence a human can scan in the audit log without decoding
// status enums — "what happened, to what, how long, and why it failed".
export function summarizeToolExecution(toolName: string, execution: ToolExecutionForSummary) {
  const target = execution.method && execution.path
    ? `${execution.method} ${execution.path}`
    : toolName;
  const timing = `${execution.latencyMs}ms`;
  const attempts = execution.attemptCount > 1 ? ` after ${execution.attemptCount} attempts` : "";

  switch (execution.status) {
    case "success":
      return execution.attemptCount === 0
        ? `${toolName} served ${target} from cache in ${timing}.`
        : `${toolName} called ${target} successfully (HTTP ${execution.upstreamStatus ?? "?"}) in ${timing}${attempts}.`;
    case "error":
      return execution.upstreamStatus
        ? `${toolName} failed: ${target} returned HTTP ${execution.upstreamStatus}${attempts} (${execution.errorCode ?? "upstream_error"}).`
        : `${toolName} failed before a response: ${execution.errorCode ?? "unknown_error"}${attempts}.`;
    case "auth_required":
    case "oauth_required":
      return `${toolName} needs credentials for ${target}; no call was made upstream.`;
    case "permission_denied":
      return `${toolName} was blocked by runtime policy before calling ${target}.`;
    case "approval_required":
      return `${toolName} is waiting for human approval before calling ${target}.`;
    case "payment_required":
      return `${toolName} needs a caller-signed x402 payment before retrying ${target}.`;
    case "validation_failed":
      return `${toolName} rejected: arguments did not match the tool schema; nothing was sent upstream.`;
    case "billing_required":
      return `${toolName} was not executed because the workspace hit its billing limit.`;
    case "rate_limited":
      return `${toolName} was rate limited before calling ${target}.`;
    default:
      return `${toolName} ended with status ${execution.status} for ${target} in ${timing}.`;
  }
}

export function auditMcpSecurityEvent(payload: Record<string, unknown>) {
  const traceId = typeof payload.trace_id === "string" && payload.trace_id.trim()
    ? payload.trace_id
    : createMcpAuditTraceId();
  const event = sanitizeStructuredLog({
    event: "astrail.mcp_security",
    timestamp: new Date().toISOString(),
    ...payload,
    trace_id: traceId,
  });
  writeStructuredLog(event);
  return event as Record<string, unknown> & { trace_id: string };
}

export function createMcpAuditTraceId() {
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const BLOCKED_BEFORE_UPSTREAM_STATUSES = new Set([
  "validation_failed",
  "auth_required",
  "oauth_required",
  "mapping_required",
  "browser_runtime_required",
  "billing_required",
  "approval_required",
  "payment_required",
  "permission_denied",
  "rate_limited",
]);

// One plain-English sentence per tool call, so the activity log reads as an
// action trail a human can audit without decoding status/error_code columns.
export function humanToolCallSummary(input: {
  toolName: string;
  status: string;
  method?: string | null;
  path?: string | null;
  latencyMs?: number | null;
  attemptCount?: number | null;
  errorCode?: string | null;
  error?: string | null;
  endUserId?: string | null;
  actorRole?: string | null;
}) {
  const actor = input.endUserId ? `End user "${input.endUserId}"` : "A workspace agent";
  const role = input.actorRole ? ` acting as "${input.actorRole}"` : "";
  const target = input.method && input.path ? ` (${input.method} ${input.path})` : "";
  const subject = `${actor}${role} called ${input.toolName}${target}`;

  if (input.status === "success") {
    const attempts = (input.attemptCount ?? 0) > 1 ? ` after ${input.attemptCount} attempts` : "";
    const latency = typeof input.latencyMs === "number" ? ` in ${input.latencyMs}ms` : "";
    return redactLogText(`${subject} — succeeded${latency}${attempts}.`);
  }

  if (BLOCKED_BEFORE_UPSTREAM_STATUSES.has(input.status)) {
    const detail = input.errorCode ?? input.status;
    return redactLogText(`${subject} — blocked before upstream execution (${detail}).`);
  }

  const attempts = (input.attemptCount ?? 0) > 1 ? ` after ${input.attemptCount} attempts` : "";
  const reason = input.error ?? input.errorCode ?? "unknown error";
  return redactLogText(`${subject} — failed${attempts}: ${reason}.`);
}
