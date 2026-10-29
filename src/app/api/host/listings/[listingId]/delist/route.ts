import { NextRequest, NextResponse } from "next/server";
import { todayInIndia } from "@/lib/booking-config";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertListingOwnedBy } from "@/lib/services/admin-writes";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Non-destructive listing removal.
 *
 * POST   -> record a delist request (nothing is deleted)
 * DELETE -> withdraw a pending request (before it has taken effect)
 * GET    -> current delist status + how many upcoming bookings hold it open
 *
 * The request takes effect via hostiggo_testing_schema.process_pending_delistings()
 * (pg_cron, every 15 min): once the request is >= 24h old AND there are no
 * non-cancelled bookings that haven't checked out yet, the listing is set
 * is_active = false / lisiting_status = 3 and delisted_at is stamped. Until
 * then it stays live and bookable. Support can see pending/processed
 * requests via delist_requested_at / delist_requested_by / delisted_at.
 */

const DELIST_DELAY_HOURS = 24;

type Ctx = { params: Promise<{ listingId: string }> };

async function authorize(req: NextRequest, ctx: Ctx) {
  const { listingId: raw } = await ctx.params;
  const listingId = Number.parseInt(raw, 10);
  if (!Number.isInteger(listingId)) {
    return { error: NextResponse.json({ error: "Invalid listing ID" }, { status: 400 }) };
  }
  let userId: string;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return { error: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
    }
    throw e;
  }
  try {
    await assertListingOwnedBy(listingId, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden";
    const status = msg === "Listing not found" ? 404 : 403;
    return { error: NextResponse.json({ error: msg }, { status }) };
  }
  return { listingId, userId };
}

async function status(listingId: number) {
  const today = todayInIndia();
  const [{ data: listing, error: lErr }, { count, error: bErr }] = await Promise.all([
    supabaseAdmin
      .from("listings")
      .select("listing_id, is_active, delist_requested_at, delist_reason, delisted_at")
      .eq("listing_id", listingId)
      .maybeSingle(),
    supabaseAdmin
      .from("bookings")
      .select("booking_id", { count: "exact", head: true })
      .eq("listing_id", listingId)
      // Confirmed only: unpaid requests expire on their own within 24h.
      .eq("status_id", 2)
      .gte("end_date", today),
  ]);
  if (lErr) throw lErr;
  if (bErr) throw bErr;
  const upcomingBookings = count ?? 0;
  const requestedAt = listing?.delist_requested_at ?? null;
  const earliestDelistAt = requestedAt
    ? new Date(new Date(requestedAt).getTime() + DELIST_DELAY_HOURS * 3600_000).toISOString()
    : null;
  return {
    listingId,
    isActive: listing?.is_active ?? null,
    delistRequestedAt: requestedAt,
    delistedAt: listing?.delisted_at ?? null,
    earliestDelistAt,
    upcomingBookings,
    state: listing?.delisted_at ? "delisted" : requestedAt ? "pending" : "none",
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authorize(req, ctx);
    if ("error" in auth) return auth.error;
    return NextResponse.json({ data: await status(auth.listingId) });
  } catch (err) {
    console.error("[GET delist] error:", err);
    return NextResponse.json({ error: "Failed to load delist status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authorize(req, ctx);
    if ("error" in auth) return auth.error;
    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;

    const current = await status(auth.listingId);
    if (current.state === "delisted") {
      return NextResponse.json({ error: "This listing has already been removed." }, { status: 409 });
    }
    if (current.state === "none") {
      const { error } = await supabaseAdmin
        .from("listings")
        .update({
          delist_requested_at: new Date().toISOString(),
          delist_requested_by: auth.userId,
          delist_reason: reason,
        })
        .eq("listing_id", auth.listingId)
        .is("delist_requested_at", null);
      if (error) throw error;
    }
    return NextResponse.json({ data: await status(auth.listingId) });
  } catch (err) {
    console.error("[POST delist] error:", err);
    return NextResponse.json({ error: "Failed to submit removal request" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authorize(req, ctx);
    if ("error" in auth) return auth.error;
    const current = await status(auth.listingId);
    if (current.state === "delisted") {
      return NextResponse.json(
        { error: "This listing has already been removed. Contact support to restore it." },
        { status: 409 },
      );
    }
    const { error } = await supabaseAdmin
      .from("listings")
      .update({ delist_requested_at: null, delist_requested_by: null, delist_reason: null })
      .eq("listing_id", auth.listingId)
      .is("delisted_at", null);
    if (error) throw error;
    return NextResponse.json({ data: await status(auth.listingId) });
  } catch (err) {
    console.error("[DELETE delist] error:", err);
    return NextResponse.json({ error: "Failed to cancel removal request" }, { status: 500 });
  }
}
