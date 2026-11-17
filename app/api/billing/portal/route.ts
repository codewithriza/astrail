import { NextResponse } from "next/server";
import { createDodoCustomerPortal, DodoApiError, DodoConfigError } from "@/lib/billing/dodo";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  let userId: string;
  try {
    const neon = await createServerNeonClient();
    const { data } = await neon.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    userId = data.user.id;
  } catch (error) {
    console.error("astrail.billing.portal.auth_unavailable", {
      message: error instanceof Error ? error.message : "Unknown auth error",
    });

    return NextResponse.json(
      { error: "Billing is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: "Billing management is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const { data: subscription, error } = await createAdminClient()
    .from("billing_subscriptions")
    .select("dodo_customer_id,status,entitlement_status,paid_confirmed_at,current_period_end,updated_at")
    .eq("user_id", userId)
    .eq("entitlement_status", "active")
    .not("paid_confirmed_at", "is", null)
    .in("status", ["active", "paid", "succeeded"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("astrail.billing.portal.subscription_lookup_failed", {
      message: error.message,
    });

    return NextResponse.json(
      { error: "Billing management is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const customerId = typeof subscription?.dodo_customer_id === "string"
    ? subscription.dodo_customer_id
    : "";
  const periodEnd = typeof subscription?.current_period_end === "string" ? new Date(subscription.current_period_end) : null;

  if (!customerId || (periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd <= new Date())) {
    return NextResponse.json(
      { error: "No active Dodo customer is linked to this workspace yet." },
      { status: 404 },
    );
  }

  try {
    const portal = await createDodoCustomerPortal({ customerId });
    return NextResponse.json(portal);
  } catch (error) {
    if (error instanceof DodoConfigError) {
      console.error("astrail.billing.portal.config_missing", {
        missing: error.missing,
      });

      return NextResponse.json(
        { error: "Billing management is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }

    if (error instanceof DodoApiError) {
      console.error("astrail.billing.portal.provider_error", {
        status: error.status,
        message: error.message,
      });

      return NextResponse.json(
        { error: "Billing portal could not be opened. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "Could not open billing portal." }, { status: 500 });
  }
}
