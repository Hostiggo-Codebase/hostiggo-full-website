import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { ACCOUNT_RE, IFSC_RE, verifyBankAccount } from "@/lib/services/kycVerify";
import { findHostUuid } from "@/lib/services/admin-writes";
import { findPayoutConflict } from "@/lib/services/payoutIdentity";

export const dynamic = "force-dynamic";

// SurePass "Bank Verification" -- reverse penny-drop lookup keyed on the
// account number + IFSC (no penny actually debited, no OTP). The lookup
// itself lives in src/lib/services/kycVerify.ts, shared with the
// payout-methods edit flow.
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);

    const body = await req.json().catch(() => ({}));
    const accountNumber = String(body?.accountNumber ?? "").replace(/\s+/g, "");
    const ifsc = String(body?.ifsc ?? "").trim().toUpperCase();

    if (!ACCOUNT_RE.test(accountNumber)) {
      return NextResponse.json({ error: "Enter a valid bank account number." }, { status: 400 });
    }
    if (!IFSC_RE.test(ifsc)) {
      return NextResponse.json({ error: "Enter a valid IFSC code (e.g. HDFC0001234)." }, { status: 400 });
    }

    // Required, not optional -- otherwise omitting it would skip the
    // name-vs-account-holder check in verifyBankAccount.
    const fullName = String(body?.fullName ?? "").trim().slice(0, 100);
    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "Enter your full name as it appears on your bank account." },
        { status: 400 },
      );
    }

    // One person, one account: refuse a bank account another host already
    // uses, before spending a SurePass lookup on it. Returned as a normal
    // `verified: false` so the form shows it like any other bank error.
    const conflict = await findPayoutConflict(await findHostUuid(userId), { accountNumber });
    if (conflict) return NextResponse.json({ data: { verified: false, reason: conflict } });

    const result = await verifyBankAccount(userId, accountNumber, ifsc, fullName);
    if (!result.verified) {
      return NextResponse.json({ data: result });
    }

    // First of the two conditions needed to auto-onboard a host to
    // Razorpay Route may now be met -- see maybeAutoOnboardHostToRoute.
    // No-op for non-hosts or hosts missing the other condition; never
    // blocks this response.
    const { maybeAutoOnboardHostToRoute, saveVerifiedPayoutDetails } = await import(
      "@/lib/services/hostRouteOnboarding"
    );
    await saveVerifiedPayoutDetails(userId, {
      accountHolderName: fullName,
      bankAccountNumber: accountNumber,
      bankIfsc: ifsc,
    });
    await maybeAutoOnboardHostToRoute(userId);

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/bank] unexpected error:", err);
    return NextResponse.json(
      { data: { verified: false, reason: "Verification failed unexpectedly. Please try again." } },
      { status: 200 },
    );
  }
}
