import { z } from "zod";
import { billingPlans } from "@/lib/billing/plans";
import { getPublicBaseUrl } from "@/lib/urls";

export const DodoCheckoutRequestSchema = z.object({
  plan: z.enum(["starter", "team"]),
});

export type DodoPlan = z.infer<typeof DodoCheckoutRequestSchema>["plan"];

export type DodoCheckoutResult = {
  checkoutUrl: string;
  sessionId: string | null;
  mode: "test_mode" | "live_mode" | "custom";
};

export type DodoPortalResult = {
  portalUrl: string;
  mode: DodoCheckoutResult["mode"];
};

export type DodoEventFields = {
  id: string | null;
  type: string | null;
  userId: string | null;
  email: string | null;
  plan: DodoPlan | null;
  subscriptionId: string | null;
  paymentId: string | null;
  customerId: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  eventCreatedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
};

const defaultBaseUrls = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
} as const;

type DodoEnvironment = keyof typeof defaultBaseUrls;

const planProductEnv: Record<DodoPlan, string[]> = {
  starter: [
    "DODO_PRODUCT_LAUNCH",
    "DODO_PRODUCT_BUILDER",
    "DODO_PRODUCT_STARTER",
    "DODO_PRODUCT_PRO",
    "DODO_PAYMENTS_PRODUCT_LAUNCH",
    "DODO_PAYMENTS_PRODUCT_BUILDER",
    "DODO_PAYMENTS_PRODUCT_STARTER",
    "DODO_PAYMENTS_PRODUCT_PRO",
  ],
  team: [
    "DODO_PRODUCT_SCALE",
    "DODO_PRODUCT_TEAM",
    "DODO_PAYMENTS_PRODUCT_SCALE",
    "DODO_PAYMENTS_PRODUCT_TEAM",
  ],
};

export function getDodoApiConfig() {
  const apiKey = firstEnv(["DODO_PAYMENTS_API_KEY", "DODO_API_KEY"]);
  const siteUrl = getPublicBaseUrl();
  const configuredBaseUrl = process.env.DODO_PAYMENTS_BASE_URL?.trim().replace(/\/$/, "");
  const configuredEnvironment = process.env.DODO_PAYMENTS_ENVIRONMENT?.trim();
  const explicitEnvironment = parseDodoEnvironment(configuredEnvironment);
  const environment = explicitEnvironment ?? inferDodoEnvironment();
  const baseUrl = configuredBaseUrl || defaultBaseUrls[environment];
  const mode: DodoCheckoutResult["mode"] = configuredBaseUrl ? "custom" : environment;
  const invalidEnvironment = Boolean(configuredEnvironment && !explicitEnvironment && !configuredBaseUrl);

  return {
    apiKey,
    siteUrl,
    baseUrl,
    mode,
    missing: [
      apiKey ? null : "DODO_PAYMENTS_API_KEY",
      invalidEnvironment ? "DODO_PAYMENTS_ENVIRONMENT" : null,
    ].filter(Boolean) as string[],
  };
}

export function getDodoBillingConfig(plan: DodoPlan) {
  const apiConfig = getDodoApiConfig();
  const productId = firstEnv(planProductEnv[plan]);

  const missing = [
    ...apiConfig.missing,
    productId ? null : planProductEnv[plan][0],
  ].filter(Boolean) as string[];

  return {
    ...apiConfig,
    productId,
    missing,
  };
}

export async function createDodoCheckout(params: {
  plan: DodoPlan;
  userId: string;
  email?: string | null;
}): Promise<DodoCheckoutResult> {
  const config = getDodoBillingConfig(params.plan);

  if (config.missing.length > 0 || !config.apiKey || !config.productId) {
    throw new DodoConfigError(config.missing);
  }

  const plan = billingPlans[params.plan];

  const response = await fetch(`${config.baseUrl}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: config.productId, quantity: 1 }],
      allowed_payment_method_types: ["credit", "debit"],
      customer: params.email ? { email: params.email } : undefined,
      return_url: `${config.siteUrl}/dashboard/billing?checkout=complete&plan=${params.plan}`,
      cancel_url: `${config.siteUrl}/dashboard/billing?checkout=cancelled&plan=${params.plan}`,
      metadata: {
        source: "astrail",
        billing_provider: "dodo",
        credit_policy_version: "2026-06-dodo-low-spend",
        plan: params.plan,
        plan_name: plan.name,
        price_label: plan.priceLabel,
        monthly_credits: String(plan.monthlyCredits ?? "fair_use"),
        monthly_tool_calls: String(plan.monthlyToolCalls ?? "fair_use"),
        monthly_generations: String(plan.monthlyGenerations ?? "fair_use"),
        hosted_endpoints: String(plan.hostedEndpoints ?? "fair_use"),
        user_id: params.userId,
        email: params.email ?? "",
      },
    }),
  });

  const text = await response.text();
  const payload = parseJsonObject(text);

  if (!response.ok) {
    throw new DodoApiError(response.status, readableDodoError(payload, text));
  }

  const checkoutUrl = stringFrom(payload, "checkout_url") ?? stringFrom(payload, "checkoutUrl");
  const sessionId = stringFrom(payload, "session_id") ?? stringFrom(payload, "sessionId");

  if (!checkoutUrl) {
    throw new DodoApiError(response.status, "Billing checkout response did not include a checkout URL.");
  }

  return {
    checkoutUrl,
    sessionId,
    mode: config.mode,
  };
}

export async function createDodoCustomerPortal(params: {
  customerId: string;
}): Promise<DodoPortalResult> {
  const config = getDodoApiConfig();

  if (config.missing.length > 0 || !config.apiKey) {
    throw new DodoConfigError(config.missing);
  }

  const url = new URL(`${config.baseUrl}/customers/${encodeURIComponent(params.customerId)}/customer-portal/session`);
  url.searchParams.set("return_url", `${config.siteUrl}/dashboard/billing`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  const payload = parseJsonObject(text);

  if (!response.ok) {
    throw new DodoApiError(response.status, readableDodoError(payload, text));
  }

  const portalUrl = stringFrom(payload, "link") ?? stringFrom(payload, "portal_url") ?? stringFrom(payload, "portalUrl");
  if (!portalUrl) {
    throw new DodoApiError(response.status, "Dodo customer portal response did not include a portal URL.");
  }

  return {
    portalUrl,
    mode: config.mode,
  };
}

export class DodoConfigError extends Error {
  constructor(public missing: string[]) {
    super("Billing checkout is not configured.");
    this.name = "DodoConfigError";
  }
}

export class DodoApiError extends Error {
  constructor(public status: number, message: string) {
    super(message || "Billing checkout request failed.");
    this.name = "DodoApiError";
  }
}

export function getDodoWebhookSecret() {
  return firstEnv(["DODO_PAYMENTS_WEBHOOK_KEY", "DODO_WEBHOOK_SECRET", "DODO_PAYMENTS_WEBHOOK_SECRET"]);
}

export function extractDodoEventFields(payload: unknown): DodoEventFields {
  const object = isRecord(payload) ? payload : {};
  const data = isRecord(object.data) ? object.data : {};
  const dataObject = isRecord(data.object) ? data.object : {};
  const customer = firstRecord(data.customer, dataObject.customer, object.customer);
  const metadata = firstRecord(data.metadata, dataObject.metadata, object.metadata, customer.metadata);
  const productId = firstString(
    data.product_id,
    data.productId,
    dataObject.product_id,
    dataObject.productId,
    firstProductCartId(data.product_cart),
    firstProductCartId(dataObject.product_cart),
  );

  return {
    id: firstString(object.id, object.event_id, object.eventId, data.id, data.event_id, data.eventId),
    type: firstString(object.type, object.event_type, object.eventType),
    userId: stringValue(metadata.user_id),
    email: firstString(metadata.email, customer.email, data.email, dataObject.email),
    plan: normalizeDodoPlan(metadata.plan) ?? normalizeDodoPlan(metadata.plan_id) ?? planFromProductId(productId),
    subscriptionId: firstString(data.subscription_id, data.subscriptionId, dataObject.subscription_id, dataObject.subscriptionId, data.id, dataObject.id),
    paymentId: firstString(data.payment_id, data.paymentId, dataObject.payment_id, dataObject.paymentId),
    customerId: firstString(data.customer_id, data.customerId, dataObject.customer_id, dataObject.customerId, customer.customer_id, customer.customerId),
    status: firstString(data.status, dataObject.status, object.type),
    amount: numberValue(data.amount) ?? numberValue(dataObject.amount) ?? numberValue(data.total_amount) ?? numberValue(dataObject.total_amount),
    currency: firstString(data.currency, dataObject.currency),
    eventCreatedAt: firstValidDateString(
      object.created_at,
      object.createdAt,
      object.timestamp,
      data.created_at,
      data.createdAt,
      data.timestamp,
      dataObject.created_at,
      dataObject.createdAt,
      dataObject.timestamp,
    ),
    currentPeriodStart: stringValue(data.current_period_start)
      ?? stringValue(data.currentPeriodStart)
      ?? stringValue(data.billing_period_start)
      ?? stringValue(data.billingPeriodStart)
      ?? stringValue(data.previous_billing_date)
      ?? stringValue(dataObject.current_period_start)
      ?? stringValue(dataObject.currentPeriodStart)
      ?? stringValue(dataObject.billing_period_start)
      ?? stringValue(dataObject.billingPeriodStart)
      ?? stringValue(dataObject.previous_billing_date),
    currentPeriodEnd: stringValue(data.current_period_end)
      ?? stringValue(data.currentPeriodEnd)
      ?? stringValue(data.billing_period_end)
      ?? stringValue(data.billingPeriodEnd)
      ?? stringValue(data.next_billing_date)
      ?? stringValue(dataObject.current_period_end)
      ?? stringValue(dataObject.currentPeriodEnd)
      ?? stringValue(dataObject.billing_period_end)
      ?? stringValue(dataObject.billingPeriodEnd)
      ?? stringValue(dataObject.next_billing_date),
    cancelAtPeriodEnd: booleanValue(data.cancel_at_period_end)
      ?? booleanValue(data.cancelAtPeriodEnd)
      ?? booleanValue(data.cancel_at_next_billing_date)
      ?? booleanValue(dataObject.cancel_at_period_end)
      ?? booleanValue(dataObject.cancelAtPeriodEnd)
      ?? booleanValue(dataObject.cancel_at_next_billing_date),
  };
}

function firstEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return "";
}

function parseJsonObject(text: string) {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringFrom(value: Record<string, unknown> | null, key: string) {
  if (!value) return null;
  return stringValue(value[key]);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const string = stringValue(value);
    if (string) return string;
  }

  return null;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    if (isRecord(value)) return value;
  }

  return {};
}

function readableDodoError(payload: Record<string, unknown> | null, fallbackText: string) {
  const error = isRecord(payload?.error) ? payload.error : {};
  const message = firstString(
    payload?.message,
    payload?.detail,
    payload?.error,
    error.message,
    error.detail,
  );

  if (message) return `Dodo request failed: ${message}`;
  if (fallbackText.trim() && fallbackText.trim().length < 240) return `Dodo request failed: ${fallbackText.trim()}`;
  return "Dodo request failed.";
}

function firstProductCartId(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const productId = firstString(item.product_id, item.productId);
    if (productId) return productId;
  }

  return null;
}

function planFromProductId(productId: string | null) {
  if (!productId) return null;
  for (const plan of Object.keys(planProductEnv) as DodoPlan[]) {
    if (planProductEnv[plan].some((key) => process.env[key]?.trim() === productId)) return plan;
  }

  return null;
}

function normalizeDodoPlan(value: unknown): DodoPlan | null {
  const plan = stringValue(value)?.toLowerCase();
  if (plan === "starter" || plan === "builder" || plan === "launch" || plan === "pro") return "starter";
  if (plan === "team" || plan === "scale") return "team";
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDodoEnvironment(value: string | undefined): DodoEnvironment | null {
  return value === "test_mode" || value === "live_mode" ? value : null;
}

function inferDodoEnvironment(): DodoEnvironment {
  return process.env.VERCEL_ENV === "production" ? "live_mode" : "test_mode";
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstValidDateString(...values: unknown[]) {
  for (const value of values) {
    const string = stringValue(value);
    if (!string) continue;
    const date = new Date(string);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
