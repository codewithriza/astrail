import { createHash, randomUUID } from "node:crypto";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
} from "@x402/core/http";
import { parsePaymentPayload, parsePaymentRequired } from "@x402/core/schemas";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { McpServer, McpTool, X402PaymentPolicy } from "@/lib/types";

export const X402_APPROVAL_CONTEXT_KEY = "__astrail_x402_approval";
export const X402_DEFAULT_NETWORKS = ["eip155:8453", "solana:mainnet"] as const;

const MAX_HEADER_CHARS = 64_000;
const MAX_POLICY_ITEMS = 32;
const MAX_ATOMIC_DIGITS = 78;
const X402_CHALLENGE_TTL_MS = 10 * 60_000;
const EVM_ASSET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TRANSACTION = /^0x[0-9a-fA-F]{64}$/;
const SOLANA_TRANSACTION = /^[1-9A-HJ-NP-Za-km-z]{32,100}$/;
const SENSITIVE_RESOURCE_QUERY_KEY = /(^|_)(api_?key|access_?token|auth|authorization|bearer|client_?secret|password|refresh_?token|secret|signature|token)($|_)/i;

export type X402Requirement = {
  x402Version: 1 | 2;
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  resource: string | null;
  maxTimeoutSeconds: number;
};

export type NormalizedX402Policy = {
  enabled: boolean;
  allowedNetworks: string[];
  allowedAssets: string[];
  maxAmountPerCall: string | null;
  dailyLimit: string | null;
  approvalThreshold: string | null;
  requireDomainVerification: boolean;
};

export type PreparedX402Payment = {
  signature: string;
  requirement: X402Requirement;
  receiptId: string;
};

export type X402PrepareResult =
  | { status: "ready"; payment: PreparedX402Payment }
  | { status: "approval_required"; requirement: X402Requirement; reason: string }
  | { status: "denied"; code: string; reason: string };

export type X402PaymentRequiredResult =
  | { status: "payment_required"; requirement: X402Requirement; requirements: X402Requirement[] }
  | { status: "approval_required"; requirement: X402Requirement; requirements: X402Requirement[] }
  | { status: "denied"; code: string; reason: string };

type X402ReceiptStatus = "reserved" | "settled" | "failed" | "in_doubt";

const localReceiptFingerprints = new Set<string>();
const localChallenges: Array<{ serverId: string; endUserId: string; toolName: string; fingerprint: string }> = [];

function normalizedList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)))
    .slice(0, MAX_POLICY_ITEMS);
}

function atomicAmount(value: unknown) {
  if (typeof value !== "string") return null;
  const amount = value.trim();
  if (!new RegExp(`^\\d{1,${MAX_ATOMIC_DIGITS}}$`).test(amount)) return null;
  return amount.replace(/^0+(?=\d)/, "");
}

export function normalizeX402Policy(policy?: X402PaymentPolicy | null): NormalizedX402Policy {
  const enabled = policy?.enabled === true;
  const networks = normalizedList(policy?.allowed_networks);
  return {
    enabled,
    allowedNetworks: enabled && networks.length === 0 ? [...X402_DEFAULT_NETWORKS] : networks,
    allowedAssets: normalizedList(policy?.allowed_assets),
    maxAmountPerCall: atomicAmount(policy?.max_amount_per_call),
    dailyLimit: atomicAmount(policy?.daily_limit),
    approvalThreshold: atomicAmount(policy?.approval_threshold),
    requireDomainVerification: true,
  };
}

function requirementFromRecord(value: unknown, version: 1 | 2, resource: string | null): X402Requirement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const amount = atomicAmount(version === 2 ? record.amount : record.maxAmountRequired);
  if (!amount) return null;
  if (![record.scheme, record.network, record.asset, record.payTo].every((item) => typeof item === "string" && item.trim())) return null;
  const timeout = Number(record.maxTimeoutSeconds);
  return {
    x402Version: version,
    scheme: String(record.scheme).trim(),
    network: String(record.network).trim(),
    asset: String(record.asset).trim(),
    amount,
    payTo: String(record.payTo).trim(),
    resource: version === 1 && typeof record.resource === "string" ? record.resource : resource,
    maxTimeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : 60,
  };
}

function paymentRequiredFromUnknown(value: unknown) {
  const parsed = parsePaymentRequired(value);
  if (!parsed.success) return null;
  const record = parsed.data as unknown as Record<string, unknown>;
  const version = record.x402Version === 1 ? 1 : 2;
  const resourceRecord = record.resource && typeof record.resource === "object" && !Array.isArray(record.resource)
    ? record.resource as Record<string, unknown>
    : null;
  const resource = resourceRecord && typeof resourceRecord.url === "string" ? resourceRecord.url : null;
  const requirements = Array.isArray(record.accepts)
    ? record.accepts.map((item) => requirementFromRecord(item, version, resource)).filter((item): item is X402Requirement => Boolean(item))
    : [];
  return requirements.length > 0 ? { version, requirements } : null;
}

export function decodeX402PaymentRequired(header: string | null | undefined, body?: unknown) {
  if (header && header.length <= MAX_HEADER_CHARS) {
    try {
      const decoded = paymentRequiredFromUnknown(decodePaymentRequiredHeader(header));
      if (decoded) return decoded;
    } catch {
      // Fall through to a validated response body for legacy x402 servers.
    }
  }
  return paymentRequiredFromUnknown(body);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

export function canonicalX402Asset(network: string, asset: string) {
  return network.startsWith("eip155:") && EVM_ASSET_ADDRESS.test(asset) ? asset.toLowerCase() : asset;
}

function requirementFingerprint(requirement: X402Requirement) {
  return createHash("sha256").update(canonicalJson(requirement)).digest("hex");
}

function decodeX402Payment(signature: string) {
  if (!signature || signature.length > MAX_HEADER_CHARS) return null;
  try {
    const parsed = parsePaymentPayload(decodePaymentSignatureHeader(signature));
    if (!parsed.success || parsed.data.x402Version !== 2) return null;
    const data = parsed.data as unknown as Record<string, unknown>;
    const resourceRecord = data.resource && typeof data.resource === "object" && !Array.isArray(data.resource)
      ? data.resource as Record<string, unknown>
      : null;
    const requirement = requirementFromRecord(data.accepted, 2, resourceRecord && typeof resourceRecord.url === "string" ? resourceRecord.url : null);
    if (!requirement) return null;
    return {
      requirement,
      // The transport header is Base64(JSON), so hashing the raw header would
      // let an identical signed proof evade replay detection by reordering JSON
      // keys. Canonicalize the validated payload before fingerprinting it.
      fingerprint: createHash("sha256").update(canonicalJson(parsed.data)).digest("hex"),
    };
  } catch {
    return null;
  }
}

export function decodeX402PaymentSignature(signature: string) {
  return decodeX402Payment(signature)?.requirement ?? null;
}

function sameResource(resource: string, target: URL) {
  try {
    const parsed = new URL(resource);
    parsed.hash = "";
    const expected = new URL(target.toString());
    expected.hash = "";
    return parsed.toString() === expected.toString();
  } catch {
    return false;
  }
}

function hasSensitiveResourceQuery(resource: string) {
  try {
    return Array.from(new URL(resource).searchParams.keys()).some((key) => SENSITIVE_RESOURCE_QUERY_KEY.test(key));
  } catch {
    return true;
  }
}

export function sameX402Requirement(left: X402Requirement | null | undefined, right: X402Requirement | null | undefined) {
  if (!left || !right) return false;
  return left.x402Version === right.x402Version
    && left.scheme === right.scheme
    && left.network === right.network
    && left.asset === right.asset
    && left.amount === right.amount
    && left.payTo === right.payTo
    && left.resource === right.resource;
}

export function evaluateX402Requirement(requirement: X402Requirement, target: URL, policy: NormalizedX402Policy) {
  if (!policy.enabled) return { allowed: false, code: "x402_disabled", reason: "Enable non-custodial x402 for this server before forwarding payment proofs." };
  if (policy.maxAmountPerCall === null || policy.dailyLimit === null) {
    return { allowed: false, code: "x402_spend_policy_required", reason: "Configure both per-call and daily atomic-unit limits before accepting x402 payments." };
  }
  if (requirement.scheme !== "exact") {
    return { allowed: false, code: "x402_scheme_blocked", reason: `The x402 scheme ${requirement.scheme} is not supported by Astrail's non-custodial runtime.` };
  }
  if (!requirement.resource) {
    return { allowed: false, code: "x402_resource_missing", reason: "The payment requirement is not bound to an upstream resource." };
  }
  if (hasSensitiveResourceQuery(requirement.resource)) {
    return { allowed: false, code: "x402_sensitive_resource", reason: "Astrail will not return or store an x402 resource URL containing credential-like query parameters." };
  }
  if (!sameResource(requirement.resource, target)) {
    return { allowed: false, code: "x402_resource_mismatch", reason: "The payment requirement is bound to a different upstream resource." };
  }
  if (!policy.allowedNetworks.includes(requirement.network)) {
    return { allowed: false, code: "x402_network_blocked", reason: `The x402 network ${requirement.network} is not allowed by this server policy.` };
  }
  if (policy.allowedAssets.length === 0) {
    return { allowed: false, code: "x402_asset_allowlist_required", reason: "Add the exact token contract or mint address to the server's x402 asset allowlist before accepting payments." };
  }
  const canonicalAsset = canonicalX402Asset(requirement.network, requirement.asset);
  if (!policy.allowedAssets.some((asset) => canonicalX402Asset(requirement.network, asset) === canonicalAsset)) {
    return { allowed: false, code: "x402_asset_blocked", reason: "The requested x402 asset is not on this server's allowlist." };
  }
  if (BigInt(requirement.amount) > BigInt(policy.maxAmountPerCall)) {
    return { allowed: false, code: "x402_per_call_limit", reason: "The x402 amount exceeds the configured per-call limit." };
  }
  return { allowed: true, code: null, reason: null };
}

export function x402RequirementNeedsApproval(requirement: X402Requirement, policy: NormalizedX402Policy) {
  return policy.approvalThreshold !== null && BigInt(requirement.amount) >= BigInt(policy.approvalThreshold);
}

export function inspectX402PaymentRequired(
  response: Response,
  parsedBody: unknown,
  target: URL,
  rawPolicy?: X402PaymentPolicy | null,
): X402PaymentRequiredResult | null {
  if (response.status !== 402) return null;
  const policy = normalizeX402Policy(rawPolicy);
  if (!policy.enabled) return null;
  const decoded = decodeX402PaymentRequired(
    response.headers.get("payment-required") ?? response.headers.get("x-payment-required"),
    parsedBody,
  );
  if (!decoded) return { status: "denied", code: "x402_invalid_requirement", reason: "The upstream returned HTTP 402 without a valid x402 payment requirement." };
  if (decoded.version !== 2) return { status: "denied", code: "x402_v2_required", reason: "Astrail forwards only x402 v2 proofs because v1 cannot be bound to the same resource and spend-policy checks." };

  const allowed = decoded.requirements.filter((requirement) => evaluateX402Requirement(requirement, target, policy).allowed);
  if (allowed.length === 0) {
    const rejected = evaluateX402Requirement(decoded.requirements[0], target, policy);
    return { status: "denied", code: rejected.code ?? "x402_policy_denied", reason: rejected.reason ?? "No offered x402 payment option matches this server's policy." };
  }
  const requirement = allowed[0];
  return x402RequirementNeedsApproval(requirement, policy)
    ? { status: "approval_required", requirement, requirements: allowed }
    : { status: "payment_required", requirement, requirements: allowed };
}

export function withX402ApprovalContext(args: Record<string, unknown>, requirement: X402Requirement) {
  return { ...args, [X402_APPROVAL_CONTEXT_KEY]: requirement };
}

export function splitX402ApprovalContext(args: Record<string, unknown>) {
  const { [X402_APPROVAL_CONTEXT_KEY]: raw, ...cleanArgs } = args;
  const record = requirementFromRecord(raw, (raw as { x402Version?: unknown } | null)?.x402Version === 1 ? 1 : 2, (raw as { resource?: unknown } | null)?.resource as string | null);
  return { args: cleanArgs, requirement: record, hadContext: raw !== undefined };
}

export function eligibleX402Domains(server: Pick<McpServer, "endpoint_map" | "source_url">) {
  const domains = new Set<string>();
  for (const endpoint of server.endpoint_map ?? []) {
    for (const candidate of [endpoint.base_url, endpoint.target_url]) {
      if (typeof candidate !== "string") continue;
      try {
        const url = new URL(candidate);
        if (url.protocol === "https:") domains.add(url.hostname.toLowerCase());
      } catch {
        // Invalid endpoint URLs are rejected by the runtime before execution.
      }
    }
  }
  if (typeof server.source_url === "string") {
    try {
      const url = new URL(server.source_url);
      if (url.protocol === "https:") domains.add(url.hostname.toLowerCase());
    } catch {
      // Pasted schemas do not have a source URL.
    }
  }
  return Array.from(domains).sort();
}

export async function recordX402Challenge(params: {
  server: McpServer;
  tool: McpTool;
  endUserId: string | null;
  requirement: X402Requirement;
}) {
  if (!params.endUserId) {
    return { ok: false, code: "x402_end_user_required", reason: "Use an Astrail API key bound to the paying end-user ID before requesting an x402 challenge." } as const;
  }
  const fingerprint = requirementFingerprint(params.requirement);
  if (isLocalServer(params.server)) {
    localChallenges.push({ serverId: params.server.id, endUserId: params.endUserId, toolName: params.tool.name, fingerprint });
    return { ok: true } as const;
  }
  if (!hasServiceRoleKey()) {
    return { ok: false, code: "x402_challenge_unavailable", reason: "Astrail could not persist the exact upstream payment challenge, so signing is disabled." } as const;
  }
  const { data, error } = await createAdminClient().rpc("record_x402_challenge", {
    p_server_id: params.server.id,
    p_user_id: params.server.user_id,
    p_end_user_id: params.endUserId,
    p_tool_name: params.tool.name,
    p_requirement_fingerprint: fingerprint,
    p_requirement: params.requirement,
    p_expires_at: new Date(Date.now() + X402_CHALLENGE_TTL_MS).toISOString(),
  });
  return error || data !== "recorded"
    ? { ok: false, code: "x402_challenge_unavailable", reason: "Astrail could not persist the exact upstream payment challenge, so signing is disabled." } as const
    : { ok: true } as const;
}

function isLocalServer(server: McpServer) {
  return ["local-demo-user", "local-preview", "preset"].includes(server.user_id);
}

async function verifiedDomain(server: McpServer, target: URL, required: boolean) {
  if (!required) return true;
  if (isLocalServer(server)) return process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1";
  if (!hasServiceRoleKey()) return false;
  const { data, error } = await createAdminClient()
    .from("x402_domain_verifications")
    .select("id")
    .eq("server_id", server.id)
    .eq("user_id", server.user_id)
    .eq("domain", target.hostname.toLowerCase())
    .eq("status", "verified")
    .maybeSingle();
  return !error && Boolean(data);
}

function rpcClaimResult(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    status: typeof record.status === "string" ? record.status : null,
    receiptId: typeof record.receipt_id === "string" ? record.receipt_id : null,
  };
}

async function claimPaymentReceipt(
  server: McpServer,
  tool: McpTool,
  endUserId: string,
  traceId: string,
  fingerprint: string,
  requirement: X402Requirement,
  dailyLimit: string | null,
) {
  const challengeFingerprint = requirementFingerprint(requirement);
  if (isLocalServer(server)) {
    if (localReceiptFingerprints.has(fingerprint)) return { status: "duplicate", receiptId: null };
    const challengeIndex = localChallenges.findIndex((challenge) => challenge.serverId === server.id
      && challenge.endUserId === endUserId
      && challenge.toolName === tool.name
      && challenge.fingerprint === challengeFingerprint);
    if (challengeIndex < 0) return { status: "challenge_missing", receiptId: null };
    localChallenges.splice(challengeIndex, 1);
    localReceiptFingerprints.add(fingerprint);
    return { status: "claimed", receiptId: randomUUID() };
  }
  if (!hasServiceRoleKey()) return { status: "unavailable", receiptId: null };
  const { data, error } = await createAdminClient().rpc("claim_x402_payment", {
    p_server_id: server.id,
    p_user_id: server.user_id,
    p_end_user_id: endUserId,
    p_tool_name: tool.name,
    p_trace_id: traceId,
    p_payment_fingerprint: fingerprint,
    p_requirement_fingerprint: challengeFingerprint,
    p_network: requirement.network,
    p_asset: canonicalX402Asset(requirement.network, requirement.asset),
    p_amount: requirement.amount,
    p_pay_to: requirement.payTo,
    p_daily_limit: dailyLimit,
  });
  if (error) return { status: "unavailable", receiptId: null };
  return rpcClaimResult(data) ?? { status: "unavailable", receiptId: null };
}

export async function prepareX402Payment(params: {
  server: McpServer;
  tool: McpTool;
  target: URL;
  signature: string;
  endUserId: string | null;
  traceId: string;
  approvedRequirement?: X402Requirement | null;
}): Promise<X402PrepareResult> {
  const policy = normalizeX402Policy(params.server.runtime_policy?.x402);
  if (!policy.enabled) return { status: "denied", code: "x402_disabled", reason: "Non-custodial x402 is not enabled for this server." };
  if (!params.endUserId) return { status: "denied", code: "x402_end_user_required", reason: "Bind this API key to an end-user ID before forwarding a user-funded payment." };
  const decodedPayment = decodeX402Payment(params.signature);
  if (!decodedPayment) return { status: "denied", code: "x402_invalid_signature", reason: "PAYMENT-SIGNATURE must contain a valid x402 v2 payment payload." };
  const { requirement } = decodedPayment;
  const evaluated = evaluateX402Requirement(requirement, params.target, policy);
  if (!evaluated.allowed) return { status: "denied", code: evaluated.code ?? "x402_policy_denied", reason: evaluated.reason ?? "The payment proof was denied by policy." };
  if (!await verifiedDomain(params.server, params.target, policy.requireDomainVerification)) {
    return { status: "denied", code: "x402_domain_unverified", reason: "Verify ownership of the upstream domain before forwarding payment proofs to it." };
  }
  if (x402RequirementNeedsApproval(requirement, policy) && !sameX402Requirement(requirement, params.approvedRequirement)) {
    return { status: "approval_required", requirement, reason: "This payment meets the configured human-approval threshold." };
  }
  const claim = await claimPaymentReceipt(
    params.server,
    params.tool,
    params.endUserId,
    params.traceId,
    decodedPayment.fingerprint,
    requirement,
    policy.dailyLimit,
  );
  if (claim.status === "limit_exceeded") return { status: "denied", code: "x402_daily_limit", reason: "This payment would exceed the end user's daily x402 limit for this asset." };
  if (claim.status === "duplicate") return { status: "denied", code: "x402_proof_replayed", reason: "This payment proof was already submitted and cannot be replayed." };
  if (claim.status === "challenge_missing") return { status: "denied", code: "x402_challenge_mismatch", reason: "This proof does not match an unexpired x402 challenge issued for the same end user, tool, and exact requirement." };
  if (claim.status !== "claimed" || !claim.receiptId) return { status: "denied", code: "x402_receipt_unavailable", reason: "Astrail could not atomically reserve this payment in the receipt ledger, so it was not forwarded." };
  return { status: "ready", payment: { signature: params.signature, requirement, receiptId: claim.receiptId } };
}

export async function finalizeX402Receipt(payment: PreparedX402Payment, response: Response | null, fallbackStatus: X402ReceiptStatus = "in_doubt") {
  let status: X402ReceiptStatus = fallbackStatus;
  let settlement: { success: boolean; transaction: string | null; network: string } | null = null;
  if (response) {
    const header = response.headers.get("payment-response") ?? response.headers.get("x-payment-response");
    if (header && header.length <= MAX_HEADER_CHARS) {
      try {
        const decoded = decodePaymentResponseHeader(header) as unknown;
        if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
          const record = decoded as Record<string, unknown>;
          const network = typeof record.network === "string" ? record.network : "";
          const rawTransaction = typeof record.transaction === "string" ? record.transaction : "";
          const validTransaction = payment.requirement.network.startsWith("eip155:")
            ? EVM_TRANSACTION.test(rawTransaction)
            : payment.requirement.network.startsWith("solana:") && SOLANA_TRANSACTION.test(rawTransaction);
          if (record.success === false && (!network || network === payment.requirement.network)) {
            settlement = { success: false, transaction: null, network: network || payment.requirement.network };
            status = "failed";
          } else if (record.success === true && network === payment.requirement.network && validTransaction) {
            settlement = { success: true, transaction: rawTransaction, network };
            status = "settled";
          } else {
            status = "in_doubt";
          }
        }
      } catch {
        status = "in_doubt";
      }
    } else {
      status = "in_doubt";
    }
  }
  if (!hasServiceRoleKey()) return { id: payment.receiptId, status, settlement };
  const transaction = settlement?.transaction ?? null;
  const { error } = await createAdminClient().from("x402_payment_receipts").update({
    status,
    transaction,
    settlement_response: settlement,
    settled_at: status === "settled" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", payment.receiptId);
  if (error) return { id: payment.receiptId, status: "in_doubt" as const, transaction: null, settlement: null };
  return { id: payment.receiptId, status, transaction, settlement };
}
