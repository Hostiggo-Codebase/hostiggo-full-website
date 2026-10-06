import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { isSurepassConfigured, surepassPost, maskMiddle, logKycRequest } from "@/lib/surepass";
import { namesMatch } from "@/lib/services/kycVerify";

export const dynamic = "force-dynamic";

const PASSPORT_VERIFY_ENDPOINT = "/api/v1/passport/passport/verify";

// Looks up a passport record by file number + date of birth (not the
// passport number itself), no document photo -- an alternative to PAN for
// identity (KYC) only; payouts still need a verified PAN. The name the user
// typed must match the name on the passport, so knowing someone else's
// file number and DOB isn't enough to verify as them.
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);

    const body = await req.json().catch(() => ({}));
    const fileNumber = String(body?.fileNumber ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const dob = String(body?.dob ?? "").trim();
    const fullName = String(body?.fullName ?? "").trim().slice(0, 100);
    if (!/^[A-Z0-9]{8,15}$/.test(fileNumber)) {
      return NextResponse.json({ error: "Enter your passport file number (e.g. DL1234567890123)." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
      return NextResponse.json({ error: "Enter your date of birth." }, { status: 400 });
    }
    if (fullName.length < 2) {
      return NextResponse.json({ error: "Enter your full name as it appears on your passport." }, { status: 400 });
    }

    if (!isSurepassConfigured()) {
      return NextResponse.json(
        { error: "Identity verification is not configured. Contact support." },
        { status: 503 }
      );
    }

    // SurePass's passport endpoint (unlike pan-adv or bank-verification)
    // requires a caller-supplied `client_id` in the request body -- without
    // it every call fails payload validation before ever looking up the
    // record, regardless of how valid the token or file_number/dob are.
    // Not documented in the contract this was ported from; found by
    // smoke-testing against the real sandbox API.
    const res = await surepassPost(PASSPORT_VERIFY_ENDPOINT, {
      file_number: fileNumber,
      dob,
      client_id: `${userId}-${Date.now()}`,
    });
    const json = await res.json().catch(() => ({}));

    let status: "verified" | "rejected";
    let reason: string | null = null;
    let providerReference: string | null = null;
    let data: Record<string, unknown> | null = null;

    if (!res.ok || !json?.success) {
      console.error("[api/verify/passport] verify error:", res.status, json);
      status = "rejected";
      reason = json?.message || "Could not find a passport record matching that file number and date of birth.";
    } else {
      data = (json.data ?? {}) as Record<string, unknown>;
      providerReference = typeof data.client_id === "string" ? data.client_id : null;
      const nameOnRecord = [data.given_name, data.surname].filter((v) => typeof v === "string" && v).join(" ");
      if (nameOnRecord && namesMatch(fullName, nameOnRecord)) {
        status = "verified";
      } else {
        status = "rejected";
        reason = "The name you entered doesn't match the name on this passport. Enter it exactly as on your passport.";
      }
    }

    const kycRequestId = await logKycRequest({
      userId,
      serviceType: "passport",
      maskedId: maskMiddle(fileNumber),
      status,
      providerReference,
      errorMessage: reason,
    });
    if (kycRequestId) {
      await supabaseAdmin.from("passport_verifications").insert({
        kyc_request_id: kycRequestId,
        file_number_masked: maskMiddle(fileNumber),
        passport_number_masked:
          typeof data?.passport_num === "string" ? maskMiddle(data.passport_num as string) : null,
        full_name: data?.given_name && data?.surname ? `${data.given_name} ${data.surname}` : null,
        dob,
        nationality: data?.nationality ?? null,
        is_valid: status === "verified",
      });
    }

    return NextResponse.json({ data: { status, reason, providerReference } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api/verify/passport] unexpected error:", err);
    return NextResponse.json(
      { error: "Verification failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
