import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { isSurepassConfigured, surepassPostForm, logKycRequest, sha256Hex } from "@/lib/surepass";
import { namesMatch } from "@/lib/services/kycVerify";

export const dynamic = "force-dynamic";

const EAADHAAR_UPLOAD_ENDPOINT = "/api/v1/aadhaar/upload/eaadhaar";
const MAX_PDF_BYTES = 5 * 1024 * 1024;

// eAadhaar PDF upload -- an alternative to PAN for identity (KYC) only.
// SurePass checks the PDF's UIDAI digital signature and returns the
// holder's details; the PDF's password is derived from the name + year of
// birth, which is why both are sent along with it. Payouts still require a
// verified PAN (Razorpay Route needs one), so this never triggers Route
// onboarding. Only the last 4 digits and the name are stored -- never the
// photo, address or full number.
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const yob = String(form?.get("yob") ?? "").trim();
    const fullName = String(form?.get("fullName") ?? "").trim().slice(0, 100);
    const password = String(form?.get("password") ?? "");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Upload your eAadhaar PDF." }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "The eAadhaar must be a PDF file." }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "The PDF is too large (max 5 MB)." }, { status: 400 });
    }
    const year = Number(yob);
    if (!/^\d{4}$/.test(yob) || year < 1900 || year > new Date().getFullYear()) {
      return NextResponse.json({ error: "Enter your year of birth (e.g. 1990)." }, { status: 400 });
    }
    if (fullName.length < 2) {
      return NextResponse.json({ error: "Enter your full name as it appears on your Aadhaar." }, { status: 400 });
    }
    if (password.length < 1 || password.length > 100) {
      return NextResponse.json({ error: "Enter the password for your eAadhaar PDF." }, { status: 400 });
    }

    if (!isSurepassConfigured()) {
      return NextResponse.json(
        { error: "Identity verification is not configured. Contact support." },
        { status: 503 }
      );
    }

    const upstream = new FormData();
    upstream.append("file", file, file.name || "eaadhaar.pdf");
    upstream.append("yob", yob);
    upstream.append("full_name", fullName);
    upstream.append("password", password);
    const res = await surepassPostForm(EAADHAAR_UPLOAD_ENDPOINT, upstream);
    const json = await res.json().catch(() => ({}));

    let status: "verified" | "rejected";
    let reason: string | null = null;
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const nameOnRecord = typeof data.name === "string" ? data.name : null;
    const maskedNumber = typeof data.aadhaar_number === "string" ? data.aadhaar_number : null;

    if (!res.ok || !json?.success) {
      console.error("[api/verify/aadhaar] upload error:", res.status, json?.message);
      status = "rejected";
      reason =
        json?.message ||
        "Could not read that eAadhaar. Upload the PDF downloaded from UIDAI and check your name and year of birth.";
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
      providerReference: null,
      errorMessage: reason,
    });
    const now = new Date().toISOString();
    // full_name, aadhaar_last4 and aadhaar_hash are NOT NULL -- a rejected
    // upload may have no record name / number, so fall back rather than
    // failing the insert. The full number is never available (eAadhaar
    // masks it), so the hash is of the masked number SurePass returned.
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
    if (aadhaarRowError) console.error("[api/verify/aadhaar] aadhaar_kyc insert failed:", aadhaarRowError);

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
