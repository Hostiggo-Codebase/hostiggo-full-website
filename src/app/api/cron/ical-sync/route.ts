import { NextRequest, NextResponse } from "next/server";
import { syncAllICalFeeds } from "@/lib/services/icalSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Syncs every listing's iCal feed. Called every 15 seconds by pg_cron + pg_net
 * (see supabase/migrations/20261006000001_ical_15s_cron.sql); Vercel's own
 * cron (vercel.json) is a once-a-minute backstop since it can't go finer.
 * Fails closed: CRON_SECRET must be set and presented as a Bearer token.
 */
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
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
