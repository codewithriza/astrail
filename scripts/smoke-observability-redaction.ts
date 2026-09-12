import {
  auditMcpSecurityEvent,
  redactedArgumentsForLog,
  sanitizeStructuredLog,
  sanitizeToolLogRecord,
  writeStructuredLog,
} from "../lib/runtime/observability";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoLeak(output: string, secret: string) {
  assert(!output.includes(secret), `redacted log should not contain ${secret}`);
}

const bearerSecret = "abc.def.secretBearer";
const apiKeySecret = "liveApiKey123456";
const clientSecret = "clientSecret123456";
const refreshToken = "refreshToken123456";
const prefixedSecret = "sk-live_abcdefghijkl";
const jwtSecret = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature";

const circular: Record<string, unknown> = {
  authorization: `Bearer ${bearerSecret}`,
  error: `upstream failed for https://api.example.test/v1/users?api_key=${apiKeySecret}&ok=1`,
  nested: {
    client_secret: clientSecret,
    message: `refresh_token=${refreshToken}`,
    vendor: `provider returned ${prefixedSecret}`,
  },
};
circular.self = circular;

const sanitized = sanitizeStructuredLog(circular) as Record<string, unknown>;
const serialized = JSON.stringify(sanitized);

assertNoLeak(serialized, bearerSecret);
assertNoLeak(serialized, apiKeySecret);
assertNoLeak(serialized, clientSecret);
assertNoLeak(serialized, refreshToken);
assertNoLeak(serialized, prefixedSecret);
assert(serialized.includes("[redacted]"), "redacted log should include redaction markers");
assert(serialized.includes("[circular]"), "circular values should not throw or recurse forever");

const toolLog = sanitizeToolLogRecord({
  event: "astrail.tool_call",
  path: `/v1/messages?access_token=${refreshToken}`,
  error: `Authorization: Bearer ${bearerSecret}`,
  credentials: { apiKey: apiKeySecret },
  accessToken: refreshToken,
  idToken: bearerSecret,
  jwt: jwtSecret,
  assertion: jwtSecret,
  note: `provider returned ${jwtSecret}`,
});
const toolLogOutput = JSON.stringify(toolLog);
assertNoLeak(toolLogOutput, bearerSecret);
assertNoLeak(toolLogOutput, apiKeySecret);
assertNoLeak(toolLogOutput, refreshToken);
assertNoLeak(toolLogOutput, jwtSecret);

const persistedArguments = JSON.stringify(redactedArgumentsForLog({ data: "ya29.opaque-provider-token", safe: "visible value" }));
assertNoLeak(persistedArguments, "ya29.opaque-provider-token");
assertNoLeak(persistedArguments, "visible value");
assert(persistedArguments.includes("data") && persistedArguments.includes("safe"), "audit arguments should retain field names");

const emitted: string[] = [];
const originalInfo = console.info;
let auditEvent: ReturnType<typeof auditMcpSecurityEvent> | null = null;
console.info = (value?: unknown) => {
  emitted.push(String(value));
};

try {
  writeStructuredLog({
    event: "astrail.tool_call",
    error: `token=${refreshToken}`,
  });
  auditEvent = auditMcpSecurityEvent({
    route: "mcp_server",
    reason: "invalid_or_missing_api_key",
    authorization: `Bearer ${bearerSecret}`,
  });
} finally {
  console.info = originalInfo;
}

assert(emitted.length === 2, "expected two structured log lines");
for (const line of emitted) {
  JSON.parse(line);
  assertNoLeak(line, bearerSecret);
  assertNoLeak(line, refreshToken);
}
assert(Boolean(auditEvent?.trace_id.match(/^sec_[a-z0-9]+_[a-z0-9]+$/)), "audit helper should return a security trace ID");
assert(emitted[1].includes("\"event\":\"astrail.mcp_security\""), "audit helper should emit security event name");
assert(JSON.parse(emitted[1]).trace_id === auditEvent?.trace_id, "emitted audit line should match returned trace ID");

console.log("PASS: observability redaction smoke checks passed.");
