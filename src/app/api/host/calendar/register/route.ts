import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncListingICalFeed } from "@/lib/services/icalSync";
import { assertListingOwnedBy } from "@/lib/services/admin-writes";

export const dynamic = "force-dynamic";

/**
 * POST /api/host/calendar/register
 * Register or update an iCal feed URL for a listing
 * This endpoint calls the external iCal microservice and updates the listing's icalLink
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listingId, icalUrl, action } = body ?? {};

    // Validate input
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    const authedUserId = await requireUserId(req);
    if (authedUserId instanceof NextResponse) return authedUserId;
    await assertListingOwnedBy(Number(listingId), authedUserId);

    if (!["add", "update", "deactivate"].includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: add, update, deactivate" },
        { status: 400 },
      );
    }

    if (action !== "deactivate" && !icalUrl?.trim()) {
      return NextResponse.json(
        { error: "icalUrl is required for add/update actions" },
        { status: 400 },
      );
    }

    const listingNum = Number(listingId);
    if (isNaN(listingNum)) {
      return NextResponse.json({ error: "listingId must be a valid number" }, { status: 400 });
    }

    // Imports are fetched by our own sync (src/lib/services/icalSync.ts), so
    // there is no third-party service to register with.
    let icalResponse: { status: string; blockedDates?: number; syncError?: string } = {
      status: action === "deactivate" ? "deactivated" : "registered",
    };

    // Update the listing in Supabase with the iCal URL (or null if deactivating)
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (action === "deactivate") {
      updatePayload.icalLink = null;
    } else if (icalUrl) {
      updatePayload.icalLink = icalUrl;
    }

    const { data: updatedListing, error: updateError } = await supabaseAdmin
      .from("listings")
      .update(updatePayload)
      .eq("listing_id", listingNum)
      .select("listing_id, icalLink, title");

    if (updateError) {
      console.error("[POST /api/host/calendar/register] Supabase update error:", updateError);
      return NextResponse.json(
        { error: `Failed to update listing: ${updateError.message}` },
        { status: 500 },
      );
    }

    if (!updatedListing || updatedListing.length === 0) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (action === "deactivate") {
      // Drop the imported blocks; manual host blocks and bookings are untouched.
      const { error: clearError } = await supabaseAdmin.rpc("sync_listing_ical_dates", {
        p_listing_id: listingNum,
        p_dates: [],
      });
      if (clearError) console.error("[POST /api/host/calendar/register] clear failed:", clearError);
    } else {
      try {
        const { blocked } = await syncListingICalFeed(listingNum, String(icalUrl).trim());
        icalResponse.blockedDates = blocked;
      } catch (syncError) {
        // The URL is saved; the 15-second sync keeps retrying. Tell the host now.
        icalResponse.syncError = syncError instanceof Error ? syncError.message : "Could not read the feed";
      }
    }

    return NextResponse.json({
      data: {
        success: true,
        listing: updatedListing[0],
        icalResponse,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/host/calendar/register] Exception:", err);
    return NextResponse.json({ error: err.message || "Request failed" }, { status: 500 });
  }
}

