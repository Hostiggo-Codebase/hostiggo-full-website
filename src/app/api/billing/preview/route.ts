import { formatINR } from '@/lib/format';
import { NextRequest, NextResponse } from "next/server";
import { calculateBookingInvoice } from "@/lib/billing/invoice";
import { calculateHostPayout } from "@/lib/billing/payout";

export const dynamic = "force-dynamic";

// Read-only demo/preview endpoint -- lets you see the invoice + payout
// breakdown for any inputs without needing a real booking or Razorpay
// credentials. Not part of the actual checkout flow (nothing calls this
// from the UI); purely for inspecting the calculations locally. Safe to
// remove before merging if you don't want it in the shipped API surface.
export async function GET(req: NextRequest) {
  const basePropertyPrice = Number(req.nextUrl.searchParams.get("basePropertyPrice") ?? 10000);
  const breakfastPrice = Number(req.nextUrl.searchParams.get("breakfastPrice") ?? 0);
  const otherServicesPrice = Number(req.nextUrl.searchParams.get("otherServicesPrice") ?? 0);

  const invoice = calculateBookingInvoice({ basePropertyPrice, breakfastPrice, otherServicesPrice });
  const payout = calculateHostPayout({
    propertyPrice: basePropertyPrice,
    breakfastPrice,
    otherServicesPrice,
  });

  return NextResponse.json({
    data: {
      input: { basePropertyPrice, breakfastPrice, otherServicesPrice },
      guestInvoice: {
        lineItems: invoice.lineItems.map((li) => ({
          label: li.label,
          amount: `${formatINR((li.amountPaise / 100))}`,
          gstRate: `${(li.gstRate * 100).toFixed(0)}%`,
          gst: `${formatINR((li.gstAmountPaise / 100))}`,
        })),
        grandTotal: `${formatINR(invoice.grandTotalRupees)}`,
      },
      hostPayout: {
        payoutBase: `${formatINR((payout.payoutBasePaise / 100))}`,
        commission: `${formatINR((payout.commissionPaise / 100))} (5%)`,
        tcs: `${formatINR((payout.tcsPaise / 100))} (1%)`,
        tds: `${formatINR((payout.tdsPaise / 100))} (1%)`,
        netHostPayout: `${formatINR(payout.netHostPayoutRupees)}`,
        note:
          "Implements the spec's formula exactly (payoutBase - 5% - 1% - 1%). Flagged: this does NOT reproduce the source doc's ₹10,788 example for a ₹10,000 property -- see src/lib/billing/README.md.",
      },
    },
  });
}
