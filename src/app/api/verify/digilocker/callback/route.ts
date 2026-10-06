import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { surepassPost, logKycRequest, sha256Hex } from "@/lib/surepass";
import { namesMatch } from "@/lib/services/kycVerify";

export const dynamic = "force-dynamic";

const DIGILOCKER_VERIFY_ENDPOINT = "/api/v1/digilocker/verify";

/**
 * Callback endpoint for DigiLocker verification.
 * After user completes DigiLocker flow, they are redirected here with query params.
 * We then verify the session and extract Aadhaar data.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("client_id");
    const userId = searchParams.get("user_id");
    const fullName = searchParams.get("full_name");
    const token = searchParams.get("token");

    if (!clientId || !userId || !fullName) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/account/verification?error=missing_params`
      );
    }

    // Verify the DigiLocker session and get Aadhaar data
    const res = await surepassPost(DIGILOCKER_VERIFY_ENDPOINT, {
      client_id: clientId,
    });

    const json = await res.json().catch(() => ({}));

    let status: "verified" | "rejected";
    let reason: string | null = null;
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const nameOnRecord = typeof data.name === "string" ? data.name : null;
    const maskedNumber = typeof data.aadhaar_number === "string" ? data.aadhaar_number : null;

    if (!res.ok || !json?.success) {
      console.error("[api/verify/digilocker/callback] verify error:", res.status, json);
      status = "rejected";
      reason = json?.message || "DigiLocker verification failed. Please try again.";
    } else if (!nameOnRecord || !namesMatch(fullName, nameOnRecord)) {
      status = "rejected";
      reason = "The name you entered doesn't match the name on this Aadhaar. Enter it exactly as on your Aadhaar.";
    } else {
      status = "verified";
    }

    const last4 = maskedNumber ? maskedNumber.replace(/\D/g, "").slice(-4) : null;
    await logKycRequest({
      userId,
      serviceType: "aadhaar",
      maskedId: last4 ? `XXXX XXXX ${last4}` : null,
      status,
      providerReference: clientId,
      errorMessage: reason,
    });

    const now = new Date().toISOString();
    const { error: aadhaarRowError } = await supabaseAdmin.from("aadhaar_kyc").insert({
      user_id: userId,
      full_name: nameOnRecord ?? fullName,
      aadhaar_last4: last4 ?? "",
      aadhaar_hash: sha256Hex(maskedNumber ?? ""),
      status,
      reason,
      submitted_at: now,
      updated_at: now,
    });
    if (aadhaarRowError) {
      console.error("[api/verify/digilocker/callback] aadhaar_kyc insert failed:", aadhaarRowError);
    }

    // Redirect back to verification page with result
    const redirectUrl = status === "verified"
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/account/verification?verified=true`
      : `${process.env.NEXT_PUBLIC_SITE_URL}/account/verification?error=${encodeURIComponent(reason || "verification_failed")}`;

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[api/verify/digilocker/callback] unexpected error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/account/verification?error=unexpected_error`
    );
  }
}
