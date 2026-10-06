import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isSurepassConfigured,
  surepassGet,
  logKycRequest,
  sha256Hex,
  verifyDigilockerTicket,
} from "@/lib/surepass";
import { namesMatch } from "@/lib/services/kycVerify";

export const dynamic = "force-dynamic";

/**
 * Called after the Digiboost SDK's onSuccess. Fetches the Aadhaar data for the
 * session from SurePass, checks the name, and records the result.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!isSurepassConfigured()) {
      return NextResponse.json({ error: "DigiLocker verification is not configured." }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId ?? "");
    const ticket = String(body?.ticket ?? "");
    const fullName = String(body?.fullName ?? "").trim().slice(0, 100);

    if (
      !/^digilocker_[A-Za-z0-9]+$/.test(clientId) ||
      fullName.length < 2 ||
      !verifyDigilockerTicket(clientId, userId, ticket)
    ) {
      return NextResponse.json({ error: "Invalid DigiLocker session." }, { status: 400 });
    }

    // Replay guard: one session -> one result.
    const { data: seen } = await supabaseAdmin
      .from("kyc_requests")
      .select("id")
      .eq("provider_ref_id", clientId)
      .limit(1);
    if (seen?.length) {
      return NextResponse.json({ error: "This DigiLocker session was already used." }, { status: 409 });
    }

    const res = await surepassGet(`/api/v1/digilocker/download-aadhaar/${clientId}`);
    const json = await res.json().catch(() => ({}));
    const xml = (json?.data?.aadhaar_xml_data ?? {}) as Record<string, unknown>;
    const nameOnRecord = typeof xml.full_name === "string" ? xml.full_name : null;
    const maskedNumber = typeof xml.masked_aadhaar === "string" ? xml.masked_aadhaar : null;

    let status: "verified" | "rejected";
    let reason: string | null = null;
    if (!res.ok || !json?.success) {
      console.error("[api/verify/digilocker/complete] download error:", res.status, json);
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
    const { error: rowError } = await supabaseAdmin.from("aadhaar_kyc").insert({
      user_id: userId,
      full_name: nameOnRecord ?? fullName,
      aadhaar_last4: last4 ?? "",
      aadhaar_hash: sha256Hex(maskedNumber ?? ""),
      status,
      reason,
      submitted_at: now,
      updated_at: now,
    });
    if (rowError) console.error("[api/verify/digilocker/complete] aadhaar_kyc insert failed:", rowError);

    return NextResponse.json({ status, reason });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/digilocker/complete] unexpected error:", err);
    return NextResponse.json({ error: "Failed to complete DigiLocker verification." }, { status: 500 });
  }
}
