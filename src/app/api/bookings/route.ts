import { NextRequest, NextResponse } from "next/server";
import { bookingsAPI } from "@/lib/services/bookings";
import { createReview, ReviewNotAllowedError } from "@/lib/services/admin-writes";
import { errorMessage } from "@/lib/api-error";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const jsonError = (err: unknown, status = 500) => {
  console.error("[/api/bookings] error:", err);
  return NextResponse.json({ error: errorMessage(err, "Request failed") }, { status });
};

export async function GET(req: NextRequest) {
  try {
    // userId is always the caller's own verified identity, never a query
    // param -- this endpoint returns booking history (guest name, phone,
    // stay dates), so a client-claimed userId would let anyone read anyone
    // else's bookings just by knowing their id. See getAuthenticatedUserId().
    const userId = await getAuthenticatedUserId(req);
    const role = req.nextUrl.searchParams.get("role") ?? "host";
    const label = req.nextUrl.searchParams.get("label") as
      | "upcoming"
      | "completed"
      | "cancelled"
      | null;
    const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);

    const data =
      role === "guest" && label
        ? await bookingsAPI.fetchGuestBookings(userId, label, page, limit)
        : await bookingsAPI.fetchBookings(userId);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return jsonError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, bookingId } = body;
    if (!bookingId) return NextResponse.json({ error: "bookingId is required" }, { status: 400 });

    // status/dates/guests all mutate an existing guest booking, and "review"
    // writes one under this user's name -- all four need the caller's real,
    // verified identity (see assertOwnsBooking in bookings.ts), never a
    // client-claimed userId from the body. A demo guest was previously able
    // to edit another guest's booking this way; see the comment on
    // assertOwnsBooking for the confirmed incident this line prevents.
    const userId = await getAuthenticatedUserId(req);

    if (action === "dates") {
      const data = await bookingsAPI.updateBookingDates(bookingId, body.checkIn, body.checkOut, userId);
      return NextResponse.json({ data });
    }

    if (action === "guests") {
      const data = await bookingsAPI.updateBookingGuests(
        bookingId,
        Number(body.adults ?? 0),
        Number(body.children ?? 0),
        Number(body.pets ?? 0),
        userId,
      );
      return NextResponse.json({ data });
    }

    if (action === "review") {
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "rating must be a whole number between 1 and 5" }, { status: 400 });
      }
      const comment = body.comment ? String(body.comment).trim().slice(0, 2000) || null : null;
      try {
        const data = await createReview({ listingId: Number(body.listingId), userId, rating, comment });
        return NextResponse.json({ data });
      } catch (e) {
        if (e instanceof ReviewNotAllowedError) {
          return NextResponse.json({ error: e.message }, { status: 403 });
        }
        throw e;
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return jsonError(err);
  }
}

// Add-ons are priced and attached server-side at reserve time
// (/api/bookings/reserve), never posted in afterwards by the client.
