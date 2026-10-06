import "server-only";
import { checkInMoment } from "./policyTimeline";
import { REFUND_ARRIVAL_NOTE } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateRefund } from "./refund";
import { createRazorpayRefund, getRazorpayClient } from "./razorpay";
import { reconstructInvoice, splitBookingAddons } from "./reconstructInvoice";
import type { BookingInvoice, CancellationPolicyConfig, CancellationPolicyType } from "./types";

const CONFIRMED_STATUS_ID = 2;
const CANCELLED_STATUS_ID = 3;

export class CancellationValidationError extends Error {}

// No generated Database type is wired into supabaseAdmin (see
// src/lib/supabase-admin.ts), and supabase-js's select-string literal
// parser falls back to an opaque error type for multi-line/concatenated
// select strings -- casting through this interface at the query boundary
// keeps the rest of this function properly typed.
interface BookingRow {
  booking_id: number;
  listing_id: number;
  host_uuid: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status_id: number;
  amount: number | null;
  razorpay_payment_id: string | null;
  refund_status: string | null;
  payout_released_at: string | null;
  amount_paise: number | null;
  invoice: BookingInvoice | null;
  razorpay_transfer_id: string | null;
}

// Add-ons the guest paid for with this booking (recorded at booking time
// by insertConfirmedBooking). Their price is part of bookings.amount, so
// the refund invoice must include them -- otherwise add-on spend silently
// drops out of the refund math entirely.
async function fetchBookingAddonPrices(bookingId: number) {
  const { data, error } = await supabaseAdmin
    .from("booking_addons")
    .select("price, type")
    .eq("booking_id", bookingId);
  if (error) throw error;
  return splitBookingAddons(data as { price: number | null; type: string | null }[] | null);
}

export interface CancelBookingResult {
  bookingId: number;
  refundAmountRupees: number;
  refundPercent: number;
  reason: string;
  razorpayRefundId: string | null;
  refundStatus: "processed" | "failed" | "not_applicable" | "flagged_for_manual_settlement";
}

export interface RefundPreviewResult {
  bookingId: number;
  policy: CancellationPolicyType;
  grandTotalRupees: number;
  refundAmountRupees: number;
  refundPercent: number;
  reason: string;
}

/**
 * Read-only counterpart to cancelBookingWithRefund -- computes the same
 * refund the guest would receive right now, without cancelling anything
 * or touching Razorpay. Used to show the amount before the guest confirms.
 */
export async function previewCancellationRefund(params: {
  bookingId: number;
  requestingUserId: string;
}): Promise<RefundPreviewResult> {
  const { bookingId, requestingUserId } = params;

  const { data: bookingRaw, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select("booking_id, listing_id, user_id, start_date, end_date, status_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (bookingErr) throw bookingErr;
  if (!bookingRaw) throw new CancellationValidationError("Booking not found.");
  const booking = bookingRaw as unknown as Pick<
    BookingRow,
    "booking_id" | "listing_id" | "user_id" | "start_date" | "end_date" | "status_id"
  >;
  if (booking.user_id !== requestingUserId) {
    throw new CancellationValidationError("You don't have permission to view this booking.");
  }
  if (booking.status_id !== CONFIRMED_STATUS_ID) {
    throw new CancellationValidationError("Only confirmed bookings can be cancelled.");
  }

  const { data: listing, error: listingErr } = await supabaseAdmin
    .from("listings")
    .select("price_weekday, price_weekend, cancellation_policy, strict_partial_refund_percent, check_in_time")
    .eq("listing_id", booking.listing_id)
    .maybeSingle();
  if (listingErr) throw listingErr;
  if (!listing) throw new CancellationValidationError("Listing not found.");

  const policy = (listing.cancellation_policy ?? "moderate") as CancellationPolicyType;
  const priceWeekday = Number(listing.price_weekday ?? 0);
  const priceWeekend = Number(listing.price_weekend ?? priceWeekday);
  const addonPrices = await fetchBookingAddonPrices(bookingId);
  const { invoice } = reconstructInvoice(
    booking.start_date,
    booking.end_date,
    priceWeekday,
    priceWeekend,
    addonPrices,
  );
  const refundCalc = calculateRefund({
    invoice,
    checkIn: checkInMoment(booking.start_date, listing.check_in_time),
    cancellationTime: new Date(),
    policyConfig: {
      policy,
      strictPartialRefundPercent: listing.strict_partial_refund_percent ?? undefined,
    },
  });

  return {
    bookingId,
    policy,
    grandTotalRupees: invoice.grandTotalRupees,
    refundAmountRupees: refundCalc.refundAmountRupees,
    refundPercent: refundCalc.refundPercent,
    reason: refundCalc.reason,
  };
}

/**
 * Section 4.8 end-to-end orchestrating function:
 *   validate -> read policy -> compute time remaining -> compute refund
 *   -> check payout status -> call Razorpay -> update DB -> (notify --
 *   stubbed, see below) -> write accounting entry -> close booking.
 *
 * Guest and host are told through the in-app/push/WhatsApp notification
 * pipeline (notify) and by email when an email provider is configured.
 */
export async function cancelBookingWithRefund(params: {
  bookingId: number;
  requestingUserId: string;
  reason?: string;
}): Promise<CancelBookingResult> {
  const { bookingId, requestingUserId, reason } = params;

  // 4.1 -- fetch booking + validate.
  const { data: bookingRaw, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "booking_id, listing_id, host_uuid, user_id, start_date, end_date, status_id, amount, razorpay_payment_id, refund_status, payout_released_at, amount_paise, invoice, razorpay_transfer_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (bookingErr) throw bookingErr;
  if (!bookingRaw) throw new CancellationValidationError("Booking not found.");
  const booking = bookingRaw as unknown as BookingRow;

  // The guest, or the host of this booking, may cancel. A host-initiated cancel
  // always refunds the guest in full -- the cancellation policy only limits what a
  // guest gets back for a change of mind, never for the host backing out.
  let cancelledByHost = false;
  if (booking.user_id !== requestingUserId) {
    const { data: hostRow, error: hostErr } = await supabaseAdmin
      .from("host")
      .select("user_id")
      .eq("host_uuid", booking.host_uuid)
      .maybeSingle();
    if (hostErr) throw hostErr;
    if (hostRow?.user_id !== requestingUserId) {
      throw new CancellationValidationError("You don't have permission to cancel this booking.");
    }
    cancelledByHost = true;
  }
  if (booking.status_id !== CONFIRMED_STATUS_ID) {
    throw new CancellationValidationError("Only confirmed bookings can be cancelled.");
  }
  if (booking.refund_status && booking.refund_status !== "none") {
    throw new CancellationValidationError("A refund has already been initiated for this booking.");
  }
  // (A booking whose refund failed is already cancelled; it is re-attempted
  // through retryFailedRefund(), never by cancelling again.)

  // Concurrency guard: a conditional UPDATE that only succeeds if
  // refund_status is still unset acts as a practical row-level lock via
  // PostgREST (true Postgres advisory locks need a custom RPC function,
  // which this schema doesn't have yet -- see the migration file for a
  // pg_advisory_xact_lock-based RPC if a stronger guarantee is needed).
  const { data: lockedRows, error: lockErr } = await supabaseAdmin
    .from("bookings")
    .update({ refund_status: "processing" })
    .eq("booking_id", bookingId)
    .is("refund_status", null)
    .select("booking_id");
  if (lockErr) throw lockErr;
  if (!lockedRows || lockedRows.length === 0) {
    throw new CancellationValidationError(
      "A refund is already being processed for this booking.",
    );
  }

  try {
    // Fetch the listing's assigned cancellation policy + real rates.
    const { data: listing, error: listingErr } = await supabaseAdmin
      .from("listings")
      .select("price_weekday, price_weekend, cancellation_policy, strict_partial_refund_percent, check_in_time")
      .eq("listing_id", booking.listing_id)
      .maybeSingle();
    if (listingErr) throw listingErr;
    if (!listing) throw new CancellationValidationError("Listing not found.");

    const policy = (listing.cancellation_policy ?? "moderate") as CancellationPolicyType;
    const priceWeekday = Number(listing.price_weekday ?? 0);
    const priceWeekend = Number(listing.price_weekend ?? priceWeekday);

    // Rebuild the invoice the same way createBooking() did at booking time
    // -- weekend nights at price_weekend, the check-in night's own rate
    // deciding the GST slab -- so the refund calc has the real subtotal and
    // real GST/service-fee line items to exclude, not a flat-rate stand-in.
    // Add-ons the guest bought are included in the invoice (their price is
    // refundable under the policy, their GST is not -- same as the stay).
    // Spec 4.3 still holds: the refund is one final amount for the whole
    // booking; add-ons can't be cancelled separately.
    const addonPrices = await fetchBookingAddonPrices(bookingId);
    const { nights, invoice } = reconstructInvoice(
      booking.start_date,
      booking.end_date,
      priceWeekday,
      priceWeekend,
      addonPrices,
    );

    const policyConfig: CancellationPolicyConfig = {
      policy,
      strictPartialRefundPercent: listing.strict_partial_refund_percent ?? undefined,
    };
    // What the guest actually paid, frozen at payment time. Refunds are computed from
    // THIS, not from today's listing prices (which may have changed since) and not
    // from a rebuilt invoice that leaves out add-ons. Bookings that predate the
    // snapshot fall back to the rebuilt invoice.
    const paidPaise =
      booking.amount_paise != null
        ? Number(booking.amount_paise)
        : Math.round(Number(booking.amount ?? 0) * 100);
    const policyRefund = calculateRefund({
      invoice: booking.invoice ?? invoice,
      checkIn: checkInMoment(booking.start_date, listing.check_in_time),
      cancellationTime: new Date(),
      policyConfig,
    });
    const refundAmountPaise = cancelledByHost
      ? paidPaise
      : Math.min(policyRefund.refundAmountPaise, paidPaise);
    const refundCalc = {
      ...policyRefund,
      refundAmountPaise,
      refundAmountRupees: refundAmountPaise / 100,
      ...(cancelledByHost
        ? { refundPercent: 100, reason: "Cancelled by the host -- full refund." }
        : {}),
    };

    let razorpayRefundId: string | null = null;
    let refundStatus: CancelBookingResult["refundStatus"] = "not_applicable";

    // 4.5 -- if payout already released, do NOT auto-refund (the money has
    // left Hostiggo); flag for manual settlement. The booking is still
    // cancelled and its nights freed below -- leaving it confirmed would keep
    // the guest "booked" and the calendar blocked for a stay that won't happen.
    if (booking.payout_released_at) {
      refundStatus = "flagged_for_manual_settlement";
      const { error: flagErr } = await supabaseAdmin.from("manual_settlement_flags").insert({
        booking_id: bookingId,
        reason: `Cancellation requested after payout released. Computed refund would be ₹${refundCalc.refundAmountRupees}.`,
        flagged_at: new Date().toISOString(),
      });
      if (flagErr) throw flagErr;
      const { sendAdminAlert } = await import("@/lib/services/adminAlerts");
      await sendAdminAlert({
        severity: "warning",
        category: "payment",
        message: `Booking #${bookingId} cancelled after payout release -- refund of ₹${refundCalc.refundAmountRupees} needs manual settlement.`,
        details: { bookingId },
      });
    } else if (refundCalc.refundAmountPaise > 0) {
      if (!booking.razorpay_payment_id) {
        throw new CancellationValidationError(
          "No Razorpay payment found for this booking -- cannot process a refund.",
        );
      }
      try {
        // 4.7 -- idempotency key ties every retry of this same cancellation
        // to the same Razorpay refund, so a network retry can never double-refund.
        const refund = await createRazorpayRefund({
          razorpayPaymentId: booking.razorpay_payment_id,
          amountPaise: refundCalc.refundAmountPaise,
          idempotencyKey: `refund:${bookingId}`,
          notes: { bookingId: String(bookingId), policy, reason: reason ?? "" },
          reverseTransfers: !!booking.razorpay_transfer_id,
        });
        razorpayRefundId = refund.id;
        refundStatus = "processed";
      } catch (razorpayErr) {
        refundStatus = "failed";
        console.error("[cancelBookingWithRefund] Razorpay refund failed:", razorpayErr);
        // The booking is about to be marked cancelled either way, so a failed refund
        // must reach a human -- otherwise the guest is cancelled AND unrefunded with
        // nothing anywhere saying so.
        await supabaseAdmin.from("manual_settlement_flags").insert({
          booking_id: bookingId,
          reason: `Refund of ₹${refundCalc.refundAmountRupees} failed at Razorpay -- needs manual refund: ${
            razorpayErr instanceof Error ? razorpayErr.message : "unknown error"
          }`,
          flagged_at: new Date().toISOString(),
        });
        // 4.7 -- notify ops on failure; retryFailedRefund() below re-attempts
        // it (safe thanks to the idempotency key above).
        const { sendAdminAlert } = await import("@/lib/services/adminAlerts");
        await sendAdminAlert({
          severity: "critical",
          category: "payment",
          message: `Refund for booking #${bookingId} failed at Razorpay -- needs a retry or manual refund.`,
          details: { bookingId, amountPaise: refundCalc.refundAmountPaise },
        });
      }
    } else {
      refundStatus = "not_applicable"; // e.g. Flexible/Strict inside their no-refund window
    }

    // 4.6 -- update booking record.
    const { error: updateErr } = await supabaseAdmin
      .from("bookings")
      .update({
        status_id: CANCELLED_STATUS_ID,
        refund_status: refundStatus === "not_applicable" ? "not_applicable" : refundStatus,
        refund_amount: refundCalc.refundAmountRupees,
        refund_reason: reason ?? null,
        refund_transaction_id: razorpayRefundId,
        cancelled_at: new Date().toISOString(),
        cancelled_by: requestingUserId,
        policy_used: policy,
        refund_processed_at: refundStatus === "processed" ? new Date().toISOString() : null,
        cancellation_reason: reason ?? null,
      })
      .eq("booking_id", bookingId);
    if (updateErr) throw updateErr;

    // The database booking trigger recalculates these nights from the
    // remaining bookings and source-owned calendar events. Do not write
    // `is_available=true` here: that could reopen a host or iCal block.

    // In-app notifications (the `notifications` table the app reads).
    // Email/SMS/push still have no provider wired in.
    try {
      const { notify, notifyWhatsApp, hostUserId, resolveUserPhone } = await import("@/lib/services/notifications");
      const refundText =
        refundStatus === "processed"
          ? ` A refund of ₹${refundCalc.refundAmountRupees} has been initiated. ${REFUND_ARRIVAL_NOTE}`
          : refundStatus === "failed" || refundStatus === "flagged_for_manual_settlement"
            ? " Your refund could not be processed automatically; our team will follow up."
            : "";
      const metadata = { booking_id: bookingId, listing_id: booking.listing_id };
      
      const { data: guest } = await supabaseAdmin
        .from("users")
        .select("name, phone")
        .eq("user_id", booking.user_id)
        .maybeSingle();
      const guestPhone = await resolveUserPhone(booking.user_id, guest?.phone);
      
      await notify({
        userId: booking.user_id,
        type: "booking_guest",
        category: "bookings",
        templateId: "booking_cancelled_guest",
        title: cancelledByHost ? "Booking cancelled by host" : "Booking cancelled",
        message: `Booking #${bookingId} was cancelled.${refundText}`,
        metadata: { ...metadata, role: "guest" },
      });
      
      const { emailUser } = await import("@/lib/services/email");
      await emailUser(booking.user_id, {
        subject: `Booking #${bookingId} cancelled`,
        heading: cancelledByHost ? "Your booking was cancelled by the host" : "Your booking was cancelled",
        lines: [
          `Booking #${bookingId} was cancelled.${refundText}`,
          ...(refundCalc.refundAmountPaise > 0 ? [`Refund amount: ₹${refundCalc.refundAmountRupees}. ${refundCalc.reason}`] : []),
        ],
      }).catch(() => {});

      const hostUser = await hostUserId(booking.host_uuid);
      if (hostUser && hostUser !== booking.user_id) {
        const { data: host } = await supabaseAdmin
          .from("users")
          .select("name, phone")
          .eq("user_id", hostUser)
          .maybeSingle();
        const hostPhone = await resolveUserPhone(hostUser, host?.phone);
        
        await notify({
          userId: hostUser,
          type: "booking_host",
          category: "bookings",
          templateId: "booking_cancelled_host",
          title: "Booking cancelled",
          message: `Booking #${bookingId} was cancelled${cancelledByHost ? " by you" : " by the guest"}.`,
          metadata: { ...metadata, role: "host" },
        });
      }
    } catch (notifyErr) {
      console.error("[cancelBookingWithRefund] notification failed:", notifyErr);
    }
    // No separate ledger table: the booking row's refund_* columns and the
    // payment/payout tables are the audit trail.

    return {
      bookingId,
      refundAmountRupees: refundCalc.refundAmountRupees,
      refundPercent: refundCalc.refundPercent,
      reason: refundCalc.reason,
      razorpayRefundId,
      refundStatus,
    };
  } catch (err) {
    // Release the processing lock on any failure so a retry isn't
    // permanently blocked by the guard above.
    await supabaseAdmin
      .from("bookings")
      .update({ refund_status: null })
      .eq("booking_id", bookingId)
      .eq("refund_status", "processing");
    throw err;
  }
}

export interface RetryRefundResult {
  bookingId: number;
  refundAmountRupees: number;
  razorpayRefundId: string;
}

/**
 * Re-attempts a refund that failed at Razorpay when the booking was cancelled
 * (refund_status = 'failed'). Allowed for the booking's guest or host, or for
 * ops when `requestingUserId` is omitted (the admin route authenticates
 * separately). Reuses the original idempotency key, so if the first attempt
 * actually went through at Razorpay this returns that same refund instead of
 * paying twice.
 */
export async function retryFailedRefund(params: {
  bookingId: number;
  requestingUserId?: string;
}): Promise<RetryRefundResult> {
  const { bookingId, requestingUserId } = params;

  const { data: bookingRaw, error } = await supabaseAdmin
    .from("bookings")
    .select(
      "booking_id, host_uuid, user_id, status_id, refund_status, refund_amount, razorpay_payment_id, razorpay_transfer_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!bookingRaw) throw new CancellationValidationError("Booking not found.");
  const booking = bookingRaw as unknown as Pick<
    BookingRow,
    "booking_id" | "host_uuid" | "user_id" | "status_id" | "refund_status" | "razorpay_payment_id" | "razorpay_transfer_id"
  > & { refund_amount: number | null };

  if (requestingUserId && booking.user_id !== requestingUserId) {
    const { data: hostRow, error: hostErr } = await supabaseAdmin
      .from("host")
      .select("user_id")
      .eq("host_uuid", booking.host_uuid)
      .maybeSingle();
    if (hostErr) throw hostErr;
    if (hostRow?.user_id !== requestingUserId) {
      throw new CancellationValidationError("You don't have permission to retry this refund.");
    }
  }
  if (booking.status_id !== CANCELLED_STATUS_ID || booking.refund_status !== "failed") {
    throw new CancellationValidationError("There is no failed refund to retry for this booking.");
  }
  const amountPaise = Math.round(Number(booking.refund_amount ?? 0) * 100);
  if (amountPaise <= 0 || !booking.razorpay_payment_id) {
    throw new CancellationValidationError("This booking has no refundable payment on record.");
  }

  // Same practical row lock as the cancel path: only one retry at a time.
  const { data: locked, error: lockErr } = await supabaseAdmin
    .from("bookings")
    .update({ refund_status: "processing" })
    .eq("booking_id", bookingId)
    .eq("refund_status", "failed")
    .select("booking_id");
  if (lockErr) throw lockErr;
  if (!locked || locked.length === 0) {
    throw new CancellationValidationError("A refund is already being processed for this booking.");
  }

  try {
    // The first attempt may have gone through even though we saw an error, so
    // look for a live refund for this booking before creating another. A
    // refund that was accepted and later failed can't be re-used (Razorpay
    // would hand the same failed refund back for the same idempotency key),
    // so a genuinely new attempt gets a fresh key.
    const existing = await getRazorpayClient().payments.fetchMultipleRefund(booking.razorpay_payment_id);
    const live = (existing.items ?? []).find(
      (r: any) => r.notes?.bookingId === String(bookingId) && r.status !== "failed",
    );
    const refund =
      live ??
      (await createRazorpayRefund({
        razorpayPaymentId: booking.razorpay_payment_id,
        amountPaise,
        idempotencyKey: `refund:${bookingId}:retry:${Date.now()}`,
        notes: { bookingId: String(bookingId), retry: "true" },
        reverseTransfers: !!booking.razorpay_transfer_id,
      }));
    await supabaseAdmin
      .from("bookings")
      .update({
        refund_status: "processed",
        refund_transaction_id: refund.id,
        refund_processed_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId);

    const { notify } = await import("@/lib/services/notifications");
    await notify({
      userId: booking.user_id,
      type: "booking_guest",
      category: "bookings",
      title: "Refund initiated",
      message: `Your refund of ₹${amountPaise / 100} for booking #${bookingId} has been initiated. ${REFUND_ARRIVAL_NOTE}`,
      metadata: { booking_id: bookingId, role: "guest" },
    });
    return { bookingId, refundAmountRupees: amountPaise / 100, razorpayRefundId: refund.id };
  } catch (err) {
    await supabaseAdmin
      .from("bookings")
      .update({ refund_status: "failed" })
      .eq("booking_id", bookingId)
      .eq("refund_status", "processing");
    throw err;
  }
}
