import { NextRequest, NextResponse } from "next/server";
import { syncAllICalFeeds } from "@/lib/services/icalSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15; // 15 seconds max

/**
 * Cron endpoint to sync iCal feeds every 15 seconds
 * Configure in Vercel or your hosting provider to call this endpoint
 * 
 * For local development, you can call this manually or set up a local cron
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authorization (cron secret or API key)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Starting iCal sync...");
    const startTime = Date.now();

    const result = await syncAllICalFeeds();

    const duration = Date.now() - startTime;
    console.log(`[Cron] iCal sync completed in ${duration}ms`);

    return NextResponse.json({
      ok: true,
      ...result,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[Cron] iCal sync failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
