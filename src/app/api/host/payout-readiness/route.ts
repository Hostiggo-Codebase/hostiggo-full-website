import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-server";
import { getHostPayoutReadiness } from "@/lib/services/hostPayoutReadiness";

export const dynamic = "force-dynamic";

// What stands between this host and going live: verified PAN, verified bank
// account, created payout account. Drives the banners and the "Go live" button.
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    return NextResponse.json({ data: await getHostPayoutReadiness(userId) });
  } catch (err) {
    console.error("[/api/host/payout-readiness] error:", err);
    return NextResponse.json({ error: "Couldn't check your payout setup." }, { status: 500 });
  }
}
