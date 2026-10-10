import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { isSurepassConfigured, surepassPost, logKycRequest, sha256Hex } from "@/lib/surepass";

export const dynamic = "force-dynamic";

const AADHAAR_VALIDATION_ENDPOINT = "/api/v1/aadhaar-validation/aadhaar-validation";
const AADHAAR_RE = /^[2-9]\d{11}$/;

// Aadhaar number validation -- an alternative to PAN for identity (KYC) only.
// Payouts still require a verified PAN (Razorpay Route needs one), so this
// never triggers Route onboarding. Only the last 4 digits and a hash are
// stored; the full Aadhaar number is sent to SurePass and then discarded.
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);

    const body = (await req.json().catch(() => ({}))) as { idNumber?: unknown; fullName?: unknown };
    const idNumber = String(body.idNumber ?? "").replace(/\D/g, "");
    const fullName = String(body.fullName ?? "").trim().slice(0, 100);

    if (!AADHAAR_RE.test(idNumber)) {
      return NextResponse.json({ error: "Enter a valid 12-digit Aadhaar number." }, { status: 400 });
    }
    if (fullName.length < 2) {
      return NextResponse.json({ error: "Enter your full name as it appears on your Aadhaar." }, { status: 400 });
    }

    if (!isSurepassConfigured()) {
      return NextResponse.json(
        { error: "Identity verification is not configured. Contact support." },
        { status: 503 }
      );
    }

    const res = await surepassPost(AADHAAR_VALIDATION_ENDPOINT, { id_number: idNumber });
    const json = await res.json().catch(() => ({}));

    let status: "verified" | "rejected";
    let reason: string | null = null;
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const providerReference = typeof data.client_id === "string" ? data.client_id : null;
    const providerAadhaar = typeof data.aadhaar_number === "string" ? data.aadhaar_number.replace(/\D/g, "") : "";
    const providerLastDigits = typeof data.last_digits === "string" ? data.last_digits.replace(/\D/g, "") : "";
    const normalizedRemarks = typeof data.remarks === "string" ? data.remarks.toLowerCase() : "";

    if (!res.ok || !json?.success || normalizedRemarks !== "success") {
      console.error("[api/verify/aadhaar] validation error:", res.status, json?.message);
      status = "rejected";
      reason = json?.message || "Aadhaar verification failed. Check the number and try again.";
    } else {
      status = "verified";
    }

    const last4 = (providerAadhaar || idNumber).slice(-4);
    const maskedId = `XXXX XXXX ${last4}`;
    await logKycRequest({
      userId,
      serviceType: "aadhaar",
      maskedId,
      status,
      providerReference,
      errorMessage: reason,
    });
    const now = new Date().toISOString();
    // full_name, aadhaar_last4 and aadhaar_hash are NOT NULL. The full
    // number is never stored; hash the submitted number for dedupe and keep
    // the provider-returned last digits when available.
    // Use upsert to handle re-verification attempts
    const { error: aadhaarRowError } = await supabaseAdmin
      .from("aadhaar_kyc")
      .upsert(
        {
          user_id: userId,
          full_name: fullName,
          aadhaar_last4: providerLastDigits.slice(-4) || last4,
          aadhaar_hash: sha256Hex(idNumber),
          status,
          reason,
          submitted_at: now,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );
    if (aadhaarRowError) console.error("[api/verify/aadhaar] aadhaar_kyc upsert failed:", aadhaarRowError);

    return NextResponse.json({ data: { status, reason } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/aadhaar] unexpected error:", err);
    return NextResponse.json(
      { error: "Verification failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
