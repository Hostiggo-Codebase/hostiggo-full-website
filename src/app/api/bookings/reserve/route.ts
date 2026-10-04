import { NextRequest, NextResponse } from "next/server";
import { createBookingWithoutPayment, validateAndPriceBooking } from "@/lib/services/admin-writes";
import { createRazorpayOrder } from "@/lib/billing/razorpay";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { GUEST_ID_REQUIRED, guestHasVerifiedId } from "@/lib/services/guestVerification";
import { rateLimit } from "@/lib/rateLimit";
import {
  BOOKINGS_DISABLED,
  PAYMENTS_ENABLED,
  UNPAID_BOOKINGS_ALLOWED,
  razorpayKeysConfigured,
  todayInIndia,
} from "@/lib/booking-config";

export const dynamic = "force-dynamic";

// With payments enabled this only validates availability, computes the real
// server-side price, and opens a Razorpay order. With payments disabled it
// creates the confirmed booking directly after the same validation.
export async function POST(req: NextRequest) {
  try {
    // The caller's identity comes from their verified Supabase session, not
    // a client-supplied userId -- this endpoint opens a real Razorpay order,
    // so a spoofed userId here could create charges/bookings attributed to
    // someone else's account. src/lib/api.ts's request() helper already
    // sends the real Bearer token on every call; this was the one place
    // that never checked it.
    const userId = await getAuthenticatedUserId(req);

    if (
      BOOKINGS_DISABLED ||
      (!PAYMENTS_ENABLED && !UNPAID_BOOKINGS_ALLOWED) ||
      (PAYMENTS_ENABLED && !razorpayKeysConfigured())
    ) {
      return NextResponse.json(
        { error: "Bookings are paused for a short while. Please try again later.", code: "BOOKINGS_PAUSED" },
        { status: 503 },
      );
    }

    // Opening an order is cheap for us and creates a Razorpay record each time.
    const limited = await rateLimit(`reserve:${userId}`, 20, 10 * 60_000);
    if (limited) return limited;

    if (GUEST_ID_REQUIRED && !(await guestHasVerifiedId(userId))) {
      return NextResponse.json(
        {
          error: "Please verify your ID (PAN, Aadhaar or passport) before booking. It only takes a minute.",
          code: "GUEST_ID_REQUIRED",
        },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const { listingId, startDate, endDate, numAdults, numChildren, addonIds } = body ?? {};
    if (!listingId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "listingId, startDate and endDate are required" },
        { status: 400 },
      );
    }
    // Basic date sanity -- validateAndPriceBooking() checks availability but
    // assumed a well-formed forward range, so a past or inverted range could
    // still price (and let a guest pay for) a nonsense booking.
    const isoDay = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDay.test(String(startDate)) || !isoDay.test(String(endDate))) {
      return NextResponse.json(
        { error: "startDate and endDate must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    const today = todayInIndia();
    if (String(endDate) <= String(startDate)) {
      return NextResponse.json(
        { error: "endDate must be after startDate" },
        { status: 400 },
      );
    }
    if (String(startDate) < today) {
      return NextResponse.json(
        { error: "startDate cannot be in the past" },
        { status: 400 },
      );
    }
    const nightCount =
      (new Date(String(endDate)).getTime() - new Date(String(startDate)).getTime()) / 86400000;
    if (nightCount > 90) {
      return NextResponse.json(
        { error: "Bookings are limited to 90 nights" },
        { status: 400 },
      );
    }

    const normalizedAddonIds = Array.isArray(addonIds) ? addonIds.slice(0, 20).map(Number) : undefined;
    const normalizedNumAdults =
      numAdults === undefined ? undefined : Math.min(30, Math.max(1, Number(numAdults) || 1));
    const normalizedNumChildren =
      numChildren === undefined ? undefined : Math.min(30, Math.max(0, Number(numChildren) || 0));

    // Note: any `amount` sent by the client is intentionally ignored,
    // validateAndPriceBooking() always recomputes the real charge
    // server-side. Only *which* addonIds were picked comes from the client;
    // their price is always looked up fresh from listing_addons.
    const bookingInput = {
      listingId: Number(listingId),
      userId: String(userId),
      startDate: String(startDate),
      endDate: String(endDate),
      numAdults: normalizedNumAdults,
      numChildren: normalizedNumChildren,
      addonIds: normalizedAddonIds,
    };

    if (UNPAID_BOOKINGS_ALLOWED) {
      const booking = await createBookingWithoutPayment(bookingInput);
      return NextResponse.json({ data: { paymentRequired: false, booking } });
    }

    const priced = await validateAndPriceBooking(bookingInput);

    // Everything finalizeBookingFromRazorpayOrder() will need to actually
    // create the booking once payment is verified travels here, in the
    // order's own `notes` -- set server-side, never editable by the client
    // that eventually posts razorpay_payment_id back to us.
    const order = await createRazorpayOrder({
      amountPaise: priced.amountPaise,
      receiptId: `booking:${listingId}:${Date.now()}`,
      notes: {
        listingId: String(listingId),
        userId: String(userId),
        startDate: String(startDate),
        endDate: String(endDate),
        ...(normalizedNumAdults !== undefined && { numAdults: String(normalizedNumAdults) }),
        ...(normalizedNumChildren !== undefined && { numChildren: String(normalizedNumChildren) }),
        ...(normalizedAddonIds?.length && { addonIds: JSON.stringify(normalizedAddonIds) }),
      },
    });

    return NextResponse.json({
      data: {
        razorpayOrderId: order.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        amountPaise: priced.amountPaise,
        amountRupees: priced.amountRupees,
        currency: "INR",
      },
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    console.error("[/api/bookings/reserve] error:", err?.message, err?.code, err?.details, err?.hint);
    return NextResponse.json(
      // Validation errors from validateAndPriceBooking are written for guests;
      // raw database codes/details are not, so they stay in the server log.
      { error: err?.code ? "We couldn't reserve these dates. Please try again." : err?.message || "Request failed" },
      { status: 500 },
    );
  }
}
