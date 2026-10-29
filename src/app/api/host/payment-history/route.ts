import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findHostUuid } from "@/lib/services/admin-writes";
import { getAuthenticatedUserId, UnauthorizedError } from "@/lib/auth-server";
import { expectedSettlementDate } from "@/lib/billing/settlement";
import { isUnpaidRequest } from "@/lib/billing/bookingRequest";

export const dynamic = "force-dynamic";

export type PaymentHistoryRow = {
  bookingId: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  bookedAt: string | null;
  paidAt: string | null;
  cancelled: boolean;
  /** What the guest paid, in rupees (payment.amount, else bookings.amount). */
  guestAmount: number | null;
  commission: number | null;
  gst: number | null;
  /** Host's net share in rupees. */
  hostPayout: number | null;
  payoutStatus: string | null;
  payoutDate: string | null;
  payoutReference: string | null;
  transferStatus: string | null;
  settlementStatus: string | null;
  utr: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  invoiceNumber: string | null;
  /** Estimated bank-credit time (T+2 working days after payment); null once settled/cancelled. */
  expectedSettlementAt: string | null;
};

// Full payment + payout history for the signed-in host: one row per booking
// (including cancelled/refunded), merged from bookings, payment, payout_items
// and payouts. Nothing is sliced -- the dashboard shows the whole history.
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const hostUuid = await findHostUuid(userId);
    if (!hostUuid) return NextResponse.json({ data: [] });

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "booking_id, start_date, end_date, booked_at, paid_at, status_id, razorpay_payment_id, amount, host_payout_paise, transfer_status, settlement_status, utr, refund_status, refund_amount, invoice_number, listings(title)",
      )
      .eq("host_uuid", hostUuid)
      .order("booked_at", { ascending: false });
    if (error) throw error;

    // Unpaid booking requests have no payment to show.
    const paidBookings = (bookings ?? []).filter((b: any) => !isUnpaidRequest(b));
    const ids = paidBookings.map((b: any) => b.booking_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });

    const [{ data: payments }, { data: items }] = await Promise.all([
      supabaseAdmin
        .from("payment")
        .select("booking_id, amount, comission, host_payout, gst_amount")
        .in("booking_id", ids),
      supabaseAdmin
        .from("payout_items")
        .select("booking_id, host_amount, commission, gst, payouts(payout_date, status, reference_id)")
        .in("booking_id", ids),
    ]);
    const paymentBy = new Map((payments ?? []).map((p: any) => [p.booking_id, p]));
    const itemBy = new Map((items ?? []).map((i: any) => [i.booking_id, i]));

    const rows: PaymentHistoryRow[] = paidBookings.map((b: any) => {
      const pay: any = paymentBy.get(b.booking_id);
      const item: any = itemBy.get(b.booking_id);
      const payout = Array.isArray(item?.payouts) ? item.payouts[0] : item?.payouts;
      const hostPayout =
        b.host_payout_paise != null
          ? Number(b.host_payout_paise) / 100
          : item?.host_amount != null
            ? Number(item.host_amount)
            : pay?.host_payout != null
              ? Number(pay.host_payout)
              : null;
      const listing = Array.isArray(b.listings) ? b.listings[0] : b.listings;
      return {
        bookingId: b.booking_id,
        title: listing?.title?.trim() || "Booked stay",
        startDate: b.start_date ?? null,
        endDate: b.end_date ?? null,
        bookedAt: b.booked_at ?? null,
        paidAt: b.paid_at ?? null,
        cancelled: Number(b.status_id) === 3,
        guestAmount: pay?.amount != null ? Number(pay.amount) : b.amount != null ? Number(b.amount) : null,
        commission: pay?.comission != null ? Number(pay.comission) : item?.commission != null ? Number(item.commission) : null,
        gst: pay?.gst_amount != null ? Number(pay.gst_amount) : item?.gst != null ? Number(item.gst) : null,
        hostPayout,
        payoutStatus: payout?.status ?? null,
        payoutDate: payout?.payout_date ?? null,
        payoutReference: payout?.reference_id ?? null,
        transferStatus: b.transfer_status ?? null,
        settlementStatus: b.settlement_status ?? null,
        utr: b.utr ?? null,
        refundStatus: b.refund_status ?? null,
        refundAmount: b.refund_amount != null ? Number(b.refund_amount) : null,
        invoiceNumber: b.invoice_number ?? null,
        expectedSettlementAt:
          Number(b.status_id) === 3 || b.settlement_status === "processed" || b.transfer_status === "failed"
            ? null
            : (expectedSettlementDate(b.paid_at)?.toISOString() ?? null),
      };
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[/api/host/payment-history] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
