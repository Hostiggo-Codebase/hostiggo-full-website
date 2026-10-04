import { NextRequest, NextResponse } from "next/server";
import { cancelBookingWithRefund, retryFailedRefund, CancellationValidationError } from "@/lib/billing/cancelBooking";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// The cancel path for both guests (my-memories) and hosts (host/bookings/
// cancel): runs the full Section 4 policy-aware refund engine. The older
// /api/bookings/cancel is a plain status flip with no refund and no longer
// has a caller in the app.
export async function POST(req: NextRequest) {
  try {
    // The caller's identity comes from their verified Supabase session, not
    // a client-supplied userId -- this endpoint moves real money via
    // Razorpay, so the ownership check in cancelBookingWithRefund() has to
    // compare against an id that can't be spoofed by editing localStorage
    // or crafting a raw request.
    const requestingUserId = await getAuthenticatedUserId(req);

    const { bookingId, reason, action } = (await req.json()) ?? {};
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }
    // A cancelled booking whose refund failed at Razorpay is retried here.
    if (action === "retry-refund") {
      const retried = await retryFailedRefund({ bookingId: Number(bookingId), requestingUserId });
      return NextResponse.json({ data: retried });
    }
    const result = await cancelBookingWithRefund({
      bookingId: Number(bookingId),
      requestingUserId,
      reason: reason ?? undefined,
    });
    return NextResponse.json({ data: result });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const status = err instanceof CancellationValidationError ? 400 : 500;
    console.error("[/api/bookings/cancel-with-refund] error:", err?.message);
    return NextResponse.json({ error: err?.message ?? "Request failed" }, { status });
  }
}
