import { NextRequest, NextResponse } from "next/server";
import { verifyRazorpayPayment } from "@/lib/billing/razorpay";
import { finalizeBookingFromRazorpayOrder, PaymentRefundedError } from "@/lib/services/admin-writes";


export const dynamic = "force-dynamic";

// Called by the browser from Razorpay Checkout's success handler, with the
// three values it hands back: razorpay_order_id, razorpay_payment_id,
// razorpay_signature. The callback firing is a client-side event with
// nothing behind it -- signature verification below is what actually proves
// the payment happened before any booking gets created. This is a backup
// confirmation path, not the only one: /api/webhooks/razorpay's
// payment.captured handler reaches the same finalizeBookingFromRazorpayOrder()
// independently, so a booking still gets created even if the guest closes
// the tab right after paying and this callback never fires.
export async function POST(req: NextRequest) {
  try {
    // Deliberately NOT gated on PAYMENTS_ENABLED: a guest who already paid
    // (signature verified below) must still get their booking even if bookings
    // were switched off while they were in the checkout window. New payments
    // are stopped earlier, in /api/bookings/reserve.

    const body = await req.json().catch(() => null);
    const razorpayOrderId = body?.razorpayOrderId;
    const razorpayPaymentId = body?.razorpayPaymentId;
    const razorpaySignature = body?.razorpaySignature;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        { error: "razorpayOrderId, razorpayPaymentId and razorpaySignature are required" },
        { status: 400 },
      );
    }

    const verified = verifyRazorpayPayment({
      orderId: String(razorpayOrderId),
      paymentId: String(razorpayPaymentId),
      signature: String(razorpaySignature),
    });
    if (!verified) {
      // Deliberately vague to the client -- confirming *which* part of the
      // triple failed would help someone iterating on a forged signature.
      console.error(
        `[/api/bookings/confirm-payment] signature verification failed for order ${razorpayOrderId}`,
      );
      return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
    }

    const booking = await finalizeBookingFromRazorpayOrder({
      orderId: String(razorpayOrderId),
      paymentId: String(razorpayPaymentId),
    });
    return NextResponse.json({ data: booking });
  } catch (err: any) {
    if (err instanceof PaymentRefundedError) {
      return NextResponse.json({ error: err.message, code: "PAYMENT_REFUNDED" }, { status: 409 });
    }
    console.error(
      "[/api/bookings/confirm-payment] error:",
      err?.message,
      err?.code,
      err?.details,
      err?.hint,
    );
    // The payment itself is verified at this point, so the guest must not be
    // told "it failed" in a way that invites paying again: the webhook
    // finalizes the same order independently.
    return NextResponse.json(
      {
        error:
          "Your payment was received, but we're still confirming the booking. Please don't pay again -- check My Trips in a few minutes.",
        code: "CONFIRMATION_PENDING",
      },
      { status: 502 },
    );
  }
}
