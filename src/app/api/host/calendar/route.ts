import { NextRequest, NextResponse } from "next/server";
import { calendarServiceAPI } from "@/lib/services/calendar";
import { upsertCalendarDay } from "@/lib/services/admin-writes";
import { errorMessage } from "@/lib/api-error";
import { getAuthenticatedUserId, requireUserId, UnauthorizedError } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const listingId = req.nextUrl.searchParams.get("listingId");
    const start = req.nextUrl.searchParams.get("start");
    const end = req.nextUrl.searchParams.get("end");

    if (!listingId || !start || !end) {
      return NextResponse.json(
        { error: "listingId, start and end are required" },
        { status: 400 },
      );
    }

    const id = Number(listingId);

    // Guest names and amounts are in this response -- only the listing's own host.
    const userId = await getAuthenticatedUserId(req);
    const { data: owner } = await supabaseAdmin
      .from("listings")
      .select("host:host_uuid(user_id)")
      .eq("listing_id", id)
      .maybeSingle();
    const hostRow: any = Array.isArray((owner as any)?.host) ? (owner as any).host[0] : (owner as any)?.host;
    if (!hostRow || hostRow.user_id !== userId) {
      return NextResponse.json({ error: "Not your listing" }, { status: 403 });
    }

    const [entries, bookings] = await Promise.all([
      calendarServiceAPI.fetchCalendarEntries(id, start, end),
      calendarServiceAPI.fetchBookingsForListing(id, start, end),
    ]);

    return NextResponse.json({ data: { entries, bookings } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[/api/host/calendar GET] error:", err);
    return NextResponse.json(
      { error: errorMessage(err, "Request failed") },
      { status: 500 },
    );
  }
}

// Update a single day's rate / availability for a listing.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const authedUserId = await requireUserId(req);
    if (authedUserId instanceof NextResponse) return authedUserId;
    const { listingId, date, price, isAvailable } = body ?? {};
    if (!listingId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return NextResponse.json(
        { error: "listingId and a yyyy-mm-dd date are required" },
        { status: 400 },
      );
    }
    if (price !== undefined && price !== null && (Number(price) < 0 || Number(price) > 10000000)) {
      return NextResponse.json({ error: "price out of range" }, { status: 400 });
    }
    const data = await upsertCalendarDay({
      listingId: Number(listingId),
      date: String(date),
      price: price === undefined || price === null ? undefined : Number(price),
      isAvailable: typeof isAvailable === "boolean" ? isAvailable : undefined,
      requestingUserId: authedUserId,
    });
    return NextResponse.json({ data });
  } catch (err) {
    const dbErr = err as { message?: string; details?: string } | null;
    if (dbErr?.message?.includes("HOSTIGGO_DATES_BOOKED")) {
      const bookedDates = (dbErr.details ?? "").split(",").filter(Boolean);
      return NextResponse.json(
        {
          error: "These dates already have a booking, so they can't be blocked.",
          code: "DATES_BOOKED",
          bookedDates,
        },
        { status: 409 },
      );
    }
    console.error("[/api/host/calendar PATCH] error:", err);
    return NextResponse.json(
      { error: errorMessage(err, "Request failed") },
      { status: 500 },
    );
  }
}
