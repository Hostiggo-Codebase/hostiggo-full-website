import { NextRequest, NextResponse } from "next/server";
import { retryFailedWhatsAppMessages } from "@/lib/services/whatsappRetry";
import { retryFailedRequestRefunds, sweepBookingRequests } from "@/lib/services/admin-writes";

// Vercel Cron calls GET (with `Authorization: Bearer $CRON_SECRET`); POST is
// kept for manual triggers.
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // Fail closed: without CRON_SECRET anyone could trigger paid re-sends.
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await retryFailedWhatsAppMessages({
      maxRetries: 3,
      maxAgeHours: 24,
      limit: 100,
    });

    // Same 5-minute tick also expires unanswered/unpaid booking requests and
    // sends their reminders. Isolated so neither job can fail the other.
    let requests: Awaited<ReturnType<typeof sweepBookingRequests>> | { error: string };
    try {
      requests = await sweepBookingRequests();
    } catch (err: any) {
      console.error("[retry-whatsapp] booking request sweep failed:", err);
      requests = { error: err?.message ?? "sweep failed" };
    }

    // Refunds Razorpay refused on cancelled requests are retried here too (with
    // back-off), so a guest's money is never left waiting on someone to notice.
    let refundRetries: Awaited<ReturnType<typeof retryFailedRequestRefunds>> | { error: string };
    try {
      refundRetries = await retryFailedRequestRefunds();
    } catch (err: any) {
      console.error("[retry-whatsapp] failed-refund retry failed:", err);
      refundRetries = { error: err?.message ?? "refund retry failed" };
    }

    return NextResponse.json({ success: true, results, requests, refundRetries });
  } catch (err: any) {
    console.error("[retry-whatsapp] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
