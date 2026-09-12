import { NextResponse } from "next/server";
import { createDodoCheckout, DodoApiError, DodoCheckoutRequestSchema, DodoConfigError } from "@/lib/billing/dodo";
import { billingLaunchFreeMode } from "@/lib/billing/plans";
import { createServerNeonClient } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (billingLaunchFreeMode) {
    return NextResponse.json(
      { error: "Checkout is paused while Astrail launch access is free." },
      { status: 409 },
    );
  }

  let data;
  try {
    const neon = await createServerNeonClient();
    const result = await neon.auth.getUser();
    data = result.data;
  } catch (error) {
    console.error("astrail.billing.checkout.auth_unavailable", {
      message: error instanceof Error ? error.message : "Unknown auth error",
    });

    return NextResponse.json(
      { error: "Billing is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  if (!data.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = DodoCheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid billing plan." }, { status: 400 });
  }

  try {
    const checkout = await createDodoCheckout({
      plan: parsed.data.plan,
      userId: data.user.id,
      email: data.user.email,
    });

    return NextResponse.json(checkout);
  } catch (error) {
    if (error instanceof DodoConfigError) {
      console.error("astrail.billing.checkout.config_missing", {
        missing: error.missing,
      });

      return NextResponse.json(
        { error: "Billing is temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }

    if (error instanceof DodoApiError) {
      console.error("astrail.billing.checkout.provider_error", {
        status: error.status,
        message: error.message,
      });

      return NextResponse.json(
        { error: "Payment checkout could not be started. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "Could not create checkout session." }, { status: 500 });
  }
}
