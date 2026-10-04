import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertListingOwnedBy } from "@/lib/services/admin-writes";
import { getHostPayoutReadiness, PayoutNotReadyError } from "@/lib/services/hostPayoutReadiness";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/host/listings/toggle
 * Toggle listing pause/unpause status (is_active)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { listingId, isActive } = body;

    if (!listingId || isActive === undefined) {
      return NextResponse.json(
        { error: "listingId and isActive are required" },
        { status: 400 },
      );
    }
    const authedUserId = await requireUserId(req);
    if (authedUserId instanceof NextResponse) return authedUserId;
    await assertListingOwnedBy(Number(listingId), authedUserId);

    // A listing that has been delisted (see ../[listingId]/delist) must not
    // be switched back on from the pause toggle.
    if (isActive) {
      // Going live needs a verified PAN, verified bank account and a created
      // payout account -- otherwise bookings could be paid for with no way to
      // pay the host.
      const readiness = await getHostPayoutReadiness(authedUserId);
      if (!readiness.ready) {
        const err = new PayoutNotReadyError(readiness.blockers);
        return NextResponse.json(
          { error: err.message, code: "PAYOUT_NOT_READY", blockers: readiness.blockers },
          { status: 403 },
        );
      }
      const { data: row, error: rowErr } = await supabaseAdmin
        .from("listings")
        .select("delisted_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (rowErr) throw rowErr;
      if (row?.delisted_at) {
        return NextResponse.json(
          { error: "This listing has been removed. Contact support to restore it." },
          { status: 409 },
        );
      }
    }

    // Update listing active status
    const { data, error } = await supabaseAdmin
      .from("listings")
      .update({ is_active: isActive })
      .eq("listing_id", listingId)
      .select("listing_id, is_active, title");

    if (error) {
      console.error("[PATCH /api/host/listings/toggle] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        listingId: data[0].listing_id,
        isActive: data[0].is_active,
        title: data[0].title,
      },
    });
  } catch (err: any) {
    console.error("[PATCH /api/host/listings/toggle] Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
