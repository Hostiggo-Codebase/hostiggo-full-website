import { NextRequest, NextResponse } from "next/server";
import { retryFailedRefund, CancellationValidationError } from "@/lib/billing/cancelBooking";

export const dynamic = "force-dynamic";

// Ops tool: POST { bookingId } with `Authorization: Bearer <ADMIN_SECRET>` to
// re-attempt a refund that failed at Razorpay. Idempotent (same Razorpay key).
export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.get("authorization") !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { bookingId } = (await req.json().catch(() => null)) ?? {};
    if (!bookingId) return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    const data = await retryFailedRefund({ bookingId: Number(bookingId) });
    return NextResponse.json({ data });
  } catch (err: any) {
    const status = err instanceof CancellationValidationError ? 400 : 502;
    console.error("[/api/admin/refunds/retry] error:", err?.message);
    return NextResponse.json({ error: err?.message ?? "Retry failed" }, { status });
  }
}
