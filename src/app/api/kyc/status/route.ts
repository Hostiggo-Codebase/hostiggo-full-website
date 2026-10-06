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

    // Check verification_status table
    const { data: verification, error } = await supabaseAdmin
      .from("verification_status")
      .select("status, submitted_at, rejection_reason")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (not an error)
      throw error;
    }

    // If no verification record, check if user is marked as verified
    if (!verification) {
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

    return NextResponse.json({
      data: {
        status: verification.status || "none",
        submittedAt: verification.submitted_at,
        reason: verification.rejection_reason,
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
