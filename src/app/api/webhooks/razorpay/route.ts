import { NextRequest, NextResponse } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/billing/razorpay";
import { finalizeBookingFromRazorpayOrder, PaymentRefundedError } from "@/lib/services/admin-writes";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Configure this URL as a webhook in the Razorpay dashboard, subscribed to
// at least `payment.captured` (and `payment.failed` for visibility -- it's
// a no-op here, see below). This is the backup confirmation path: the
// browser-side checkout callback (/api/bookings/confirm-payment) can simply
// never fire -- guest closes the tab, phone loses signal, browser crashes --
// right after a payment that Razorpay itself considers successful. Without
// this, that guest paid and has no booking. Both paths converge on the same
// finalizeBookingFromRazorpayOrder(), which is idempotent on
// razorpay_payment_id, so whichever fires first wins and the other is a
// harmless no-op.
export async function POST(req: NextRequest) {
  // Must read the raw body before any JSON parsing -- verification is over
  // the exact bytes Razorpay sent and signed; parsing then re-stringifying
  // can reorder keys and silently break the signature check.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing X-Razorpay-Signature header" }, { status: 400 });
  }

  let verified: boolean;
  try {
    verified = verifyRazorpayWebhookSignature(rawBody, signature);
  } catch (err: any) {
    console.error("[/api/webhooks/razorpay] verification error:", err?.message);
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  if (!verified) {
    console.error("[/api/webhooks/razorpay] signature mismatch -- rejecting");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = payload?.event;

  // Record every delivery in razorpay_webhook_events (PK = Razorpay's event
  // id) so a redelivery of an already-processed event is a no-op and every
  // outcome/error is inspectable. Fail-soft: if the log table can't be
  // written, still process the event -- the handlers below are idempotent.
  const eventId = req.headers.get("x-razorpay-event-id");
  if (eventId) {
    const { error: logError } = await supabaseAdmin
      .from("razorpay_webhook_events")
      .insert({ event_id: eventId, event_type: String(event ?? "unknown"), payload });
    if (logError?.code === "23505") {
      const { data: prior } = await supabaseAdmin
        .from("razorpay_webhook_events")
        .select("processed_at")
        .eq("event_id", eventId)
        .maybeSingle();
      if (prior?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
    } else if (logError) {
      console.error("[/api/webhooks/razorpay] could not log event:", logError.message);
    }
  }

  const response = await processEvent(event, payload);

  if (eventId) {
    const failed = response.status >= 400;
    await supabaseAdmin
      .from("razorpay_webhook_events")
      .update(
        failed
          ? { error: `HTTP ${response.status}` }
          : { processed_at: new Date().toISOString(), error: null },
      )
      .eq("event_id", eventId);
  }
  return response;
}

async function processEvent(event: string | undefined, payload: any): Promise<NextResponse> {
  if (event === "payment.captured") {
    const payment = payload?.payload?.payment?.entity;
    const orderId = payment?.order_id;
    const paymentId = payment?.id;
    if (!orderId || !paymentId) {
      console.error("[/api/webhooks/razorpay] payment.captured missing order_id/payment id");
      return NextResponse.json({ error: "Malformed payment.captured payload" }, { status: 400 });
    }
    try {
      await finalizeBookingFromRazorpayOrder({ orderId, paymentId });
    } catch (err: any) {
      // Returning 500 tells Razorpay to retry the webhook -- correct for a
      // transient DB error, but a genuine "dates no longer available"
      // rejection (already refunded inside finalizeBookingFromRazorpayOrder)
      // would just retry forever for no benefit, so that one is acknowledged.
      if (err instanceof PaymentRefundedError) {
        console.warn(`[/api/webhooks/razorpay] payment ${paymentId} refunded, no booking: ${err.message}`);
        return NextResponse.json({ ok: true, refunded: true });
      }
      console.error(
        `[/api/webhooks/razorpay] finalize failed for payment ${paymentId}:`,
        err?.message,
      );
      return NextResponse.json({ error: err?.message || "Finalize failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (event === "payment.failed") {
    // Nothing to do -- no booking was ever created for an unpaid order (see
    // /api/bookings/reserve), so a failed payment leaves nothing to clean
    // up. Logged for visibility only.
    console.log("[/api/webhooks/razorpay] payment.failed:", payload?.payload?.payment?.entity?.id);
    return NextResponse.json({ ok: true });
  }

  // Route split-payment lifecycle (see createHostTransferForBooking in
  // admin-writes.ts, which creates the transfer this event confirms).
  // Idempotent by construction: both are plain status/id updates keyed by
  // razorpay_transfer_id, so a duplicate webhook delivery just writes the
  // same value again rather than creating anything new.
  if (event === "transfer.processed") {
    const transfer = payload?.payload?.transfer?.entity;
    if (!transfer?.id) {
      console.error("[/api/webhooks/razorpay] transfer.processed missing transfer id");
      return NextResponse.json({ error: "Malformed transfer.processed payload" }, { status: 400 });
    }
    // recipient_settlement_id links this transfer to the settlement that
    // will later pay it out (settlement.processed below matches on it).
    const update: Record<string, unknown> = { transfer_status: "processed" };
    if (transfer.recipient_settlement_id) {
      update.settlement_id = transfer.recipient_settlement_id;
      update.settlement_status = "pending";
    }
    const { data: rows, error } = await supabaseAdmin
      .from("bookings")
      .update(update)
      .eq("razorpay_transfer_id", transfer.id)
      .select("booking_id, host_uuid");
    if (error) {
      console.error("[/api/webhooks/razorpay] failed to update transfer_status:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }
    for (const b of rows ?? []) {
      const { notify, hostUserId } = await import("@/lib/services/notifications");
      const hostUser = await hostUserId(b.host_uuid);
      if (hostUser) {
        await notify({
          userId: hostUser,
          type: "booking_host",
          category: "account",
          templateId: "payout_sent_host",
          title: transfer.on_hold ? "Earnings secured" : "Payout on its way",
          message: transfer.on_hold
            ? `Your earnings for booking #${b.booking_id} are secured and will be released 24 hours after check-in.`
            : `Your earnings for booking #${b.booking_id} have been transferred and will be settled to your bank account.`,
          metadata: { booking_id: b.booking_id, role: "host", transfer_id: transfer.id },
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (event === "settlement.processed") {
    const settlement = payload?.payload?.settlement?.entity;
    if (!settlement?.id) {
      console.error("[/api/webhooks/razorpay] settlement.processed missing settlement id");
      return NextResponse.json({ error: "Malformed settlement.processed payload" }, { status: 400 });
    }
    const { data: rows, error } = await supabaseAdmin
      .from("bookings")
      .update({
        settlement_status: "processed",
        utr: settlement.utr ?? null,
        payout_released_at: new Date().toISOString(),
      })
      .eq("settlement_id", settlement.id)
      .select("booking_id, host_uuid");
    if (error) {
      console.error("[/api/webhooks/razorpay] failed to update settlement:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }
    const { setPayoutStatusForBooking } = await import("@/lib/services/admin-writes");
    const { notify, hostUserId } = await import("@/lib/services/notifications");
    for (const b of rows ?? []) {
      await setPayoutStatusForBooking(b.booking_id, "credited", settlement.utr ?? null).catch(() => {});
      const hostUser = await hostUserId(b.host_uuid);
      if (hostUser) {
        await notify({
          userId: hostUser,
          type: "booking_host",
          category: "account",
          title: "Payout credited",
          message: `Your earnings for booking #${b.booking_id} were credited to your bank account${settlement.utr ? ` (UTR ${settlement.utr})` : ""}.`,
          metadata: { booking_id: b.booking_id, role: "host", utr: settlement.utr ?? null },
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Refund lifecycle. cancel-with-refund records "processed" the moment
  // Razorpay accepts the refund; these events carry the real outcome (a refund
  // can be accepted and later fail at the bank), so a failure surfaces here
  // instead of the guest silently never getting their money.
  if (event === "refund.processed" || event === "refund.failed") {
    const refund = payload?.payload?.refund?.entity;
    if (!refund?.id) {
      console.error(`[/api/webhooks/razorpay] ${event} missing refund id`);
      return NextResponse.json({ error: `Malformed ${event} payload` }, { status: 400 });
    }
    const { data: rows, error } = await supabaseAdmin
      .from("bookings")
      .select("booking_id, user_id")
      .eq("refund_transaction_id", refund.id);
    if (error) {
      console.error("[/api/webhooks/razorpay] refund lookup failed:", error);
      return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
    }
    const { notify } = await import("@/lib/services/notifications");
    if (event === "refund.processed") {
      for (const b of rows ?? []) {
        await supabaseAdmin
          .from("bookings")
          .update({ refund_status: "processed", refund_processed_at: new Date().toISOString() })
          .eq("booking_id", b.booking_id);
        await notify({
          userId: b.user_id,
          type: "booking_guest",
          category: "bookings",
          title: "Refund processed",
          message: `Your refund for booking #${b.booking_id} has been processed and will reach your original payment method within 5-7 banking days, depending on your bank.`,
          metadata: { booking_id: b.booking_id, role: "guest" },
        });
      }
      return NextResponse.json({ ok: true });
    }
    // refund.failed: reopen the booking's refund for retry and tell ops.
    // (Refunds with no booking row, e.g. race-loss refunds, still alert.)
    for (const b of rows ?? []) {
      await supabaseAdmin
        .from("bookings")
        .update({ refund_status: "failed", refund_transaction_id: null })
        .eq("booking_id", b.booking_id);
      await supabaseAdmin.from("manual_settlement_flags").insert({
        booking_id: b.booking_id,
        reason: `Refund ${refund.id} failed after being accepted by Razorpay -- retry or refund manually.`,
        flagged_at: new Date().toISOString(),
      });
      await notify({
        userId: b.user_id,
        type: "booking_guest",
        category: "bookings",
        title: "Refund delayed",
        message: `Your refund for booking #${b.booking_id} hit a problem. We're on it and you can also retry it from your booking.`,
        metadata: { booking_id: b.booking_id, role: "guest" },
      });
    }
    const { sendAdminAlert } = await import("@/lib/services/adminAlerts");
    await sendAdminAlert({
      severity: "critical",
      category: "payment",
      message: `Razorpay refund ${refund.id} failed (payment ${refund.payment_id ?? "?"}).`,
      details: { refundId: refund.id, paymentId: refund.payment_id, amount: refund.amount },
    });
    return NextResponse.json({ ok: true });
  }

  // Any other subscribed event -- acknowledge so
  // Razorpay doesn't retry, nothing to act on here yet.
  return NextResponse.json({ ok: true });
}
