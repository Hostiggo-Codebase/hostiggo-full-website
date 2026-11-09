import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { forbiddenResponse, requireUserId } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kyc/status
 * The signed-in user's identity-verification state, read from kyc_requests
 * (and pan_verifications for the verified name).
 *
 * Any verified document (PAN, Aadhaar or passport) means "verified", even if a
 * later attempt failed -- same rule payout onboarding uses -- so a retry that
 * was rejected can't hide a PAN that is already verified. Only when nothing is
 * verified does the latest attempt decide (pending / rejected).
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    // Accepted for backwards compatibility, but only your own KYC is readable.
    const requested = new URL(req.url).searchParams.get("userId");
    if (requested && requested !== userId) return forbiddenResponse();

    const { data: requests, error } = await supabaseAdmin
      .from("kyc_requests")
      .select("id, status, created_at, service_type, error_message, masked_id")
      .eq("user_id", userId)
      .in("service_type", ["pan", "aadhaar", "passport"])
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[KYC Status API] Database error:", error);
      return NextResponse.json({ error: "Could not read your verification status." }, { status: 500 });
    }

    const rows = requests ?? [];
    const verified = rows.find((r) => r.status === "verified");
    const latest = rows[0];

    if (verified) {
      let verifiedName: string | null = null;
      if (verified.service_type === "pan") {
        const { data: detail } = await supabaseAdmin
          .from("pan_verifications")
          .select("full_name")
          .eq("kyc_request_id", verified.id)
          .maybeSingle();
        verifiedName = detail?.full_name ?? null;
      }
      return NextResponse.json({
        data: {
          status: "verified",
          submittedAt: verified.created_at,
          reason: null,
          documentType: verified.service_type,
          maskedId: verified.masked_id ?? null,
          verifiedName,
        },
      });
    }

    if (!latest) {
      // Legacy: accounts marked verified before kyc_requests existed.
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("is_verified")
        .eq("user_id", userId)
        .maybeSingle();
      return NextResponse.json({
        data: {
          status: user?.is_verified ? "verified" : "none",
          submittedAt: null,
          reason: null,
          documentType: null,
          maskedId: null,
          verifiedName: null,
        },
      });
    }

    const status =
      latest.status === "rejected" || latest.status === "failed"
        ? "rejected"
        : latest.status === "pending"
          ? "pending"
          : "none";
    return NextResponse.json({
      data: {
        status,
        submittedAt: latest.created_at,
        reason: latest.error_message || null,
        documentType: latest.service_type,
        maskedId: latest.masked_id ?? null,
        verifiedName: null,
      },
    });
  } catch (err) {
    console.error("[KYC Status API] Error:", err);
    return NextResponse.json({ error: "Failed to fetch KYC status" }, { status: 500 });
  }
}
