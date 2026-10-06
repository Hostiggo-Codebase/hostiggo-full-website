import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kyc/status
 * Returns KYC verification status for a user
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 }
      );
    }

    // Check for any verified identity document (PAN, Aadhaar, or Passport)
    const { data: verifiedDocs, error } = await supabaseAdmin
      .from("kyc_requests")
      .select("status, created_at, service_type, error_message")
      .eq("user_id", userId)
      .in("service_type", ["pan", "aadhaar", "passport"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    const latestRequest = verifiedDocs?.[0];

    if (!latestRequest) {
      // Check if user is marked as verified (legacy)
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("is_verified")
        .eq("user_id", userId)
        .single();

      if (user?.is_verified) {
        return NextResponse.json({
          data: {
            status: "verified",
            submittedAt: null,
            reason: null,
          },
        });
      }

      return NextResponse.json({
        data: {
          status: "none",
          submittedAt: null,
          reason: null,
        },
      });
    }

    // Map kyc_requests status to our KYC status
    let status: string = "none";
    if (latestRequest.status === "verified") {
      status = "verified";
    } else if (latestRequest.status === "rejected" || latestRequest.status === "failed") {
      status = "rejected";
    } else if (latestRequest.status === "pending") {
      status = "pending";
    }

    return NextResponse.json({
      data: {
        status,
        submittedAt: latestRequest.created_at,
        reason: latestRequest.error_message || null,
      },
    });
  } catch (err: any) {
    console.error("[KYC Status API] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch KYC status" },
      { status: 500 }
    );
  }
}
