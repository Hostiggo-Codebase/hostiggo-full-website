import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { PAN_RE, verifyPanNumber } from "@/lib/services/kycVerify";

export const dynamic = "force-dynamic";

// PAN Comprehensive -- direct number lookup, no document photo. `success:
// true` from SurePass is the verified signal. The lookup itself lives in
// src/lib/services/kycVerify.ts, shared with the payout-methods edit flow.
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);

    const body = await req.json().catch(() => ({}));
    const idNumber = String(body?.idNumber ?? "").trim().toUpperCase();
    if (!PAN_RE.test(idNumber)) {
      return NextResponse.json({ error: "Enter a valid PAN (e.g. ABCDE1234F)." }, { status: 400 });
    }
    // Required, not optional -- otherwise omitting it would skip the
    // name-vs-PAN check in verifyPanNumber.
    const fullName = String(body?.fullName ?? "").trim().slice(0, 100);
    if (fullName.length < 2) {
      return NextResponse.json({ error: "Enter your full name as it appears on your PAN." }, { status: 400 });
    }

    const { status, reason, providerReference } = await verifyPanNumber(userId, idNumber, fullName);

    // Second of the two conditions needed to auto-onboard a host to
    // Razorpay Route may now be met -- see maybeAutoOnboardHostToRoute.
    // No-op for non-hosts or hosts missing the other condition; never
    // blocks this response.
    if (status === "verified") {
      const { maybeAutoOnboardHostToRoute, saveVerifiedPayoutDetails } = await import(
        "@/lib/services/hostRouteOnboarding"
      );
      await saveVerifiedPayoutDetails(userId, { accountHolderName: fullName, panNumber: idNumber });
      await maybeAutoOnboardHostToRoute(userId);
    }

    return NextResponse.json({ data: { status, reason, providerReference } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/pan] unexpected error:", err);
    return NextResponse.json(
      { error: "Verification failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
