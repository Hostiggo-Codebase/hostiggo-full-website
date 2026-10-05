import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SCHEMA } from "@/lib/schema.constants";
import { isISODate } from "@/lib/stayDates";

const DB_SCHEMA = SCHEMA.testingSchema;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const listingId = Number(searchParams.get("listingId"));
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!listingId || !startDate || !endDate) {
    return NextResponse.json({ error: "listingId, startDate and endDate are required" }, { status: 400 });
  }

  // Guard against malformed date values (e.g. the literal string "null"
  // from a stale client value) reaching Postgres -- an invalid date
  // string there throws at the query level, which previously surfaced as
  // the generic 500 "Could not verify availability" below instead of a
  // clear validation error.
  if (!Number.isSafeInteger(listingId) || listingId < 1 || !isISODate(startDate) || !isISODate(endDate) || endDate <= startDate) {
    return NextResponse.json(
      { error: "Select valid YYYY-MM-DD dates with checkout after check-in." },
      { status: 400 },
    );
  }

  // Check for blocked calendar days.
  const { data: blocked, error: blockedErr } = await supabaseAdmin
    .schema(DB_SCHEMA)
    .from("listing_calendar")
    .select("date")
    .eq("listing_id", listingId)
    .gte("date", startDate)
    .lt("date", endDate)
    .eq("is_available", false);

  if (blockedErr) {
    console.error("[check-availability] blocked-days query failed:", blockedErr);
    return NextResponse.json(
      { error: "Could not verify availability. Please try again." },
      { status: 500 },
    );
  }

  if (blocked && blocked.length > 0) {
    return NextResponse.json({ available: false, reason: "These dates are blocked. Please choose different dates.", blockedDates: blocked.map((row) => row.date) });
  }

  // Check for overlapping confirmed bookings.
  const { data: conflicts, error: conflictsErr } = await supabaseAdmin
    .schema(DB_SCHEMA)
    .from("bookings")
    .select("booking_id")
    .eq("listing_id", listingId)
    .eq("status_id", 2)
    .lt("start_date", endDate)
    .gt("end_date", startDate)
    .limit(1);

  if (conflictsErr) {
    console.error("[check-availability] conflicts query failed:", conflictsErr);
    return NextResponse.json(
      { error: "Could not verify availability. Please try again." },
      { status: 500 },
    );
  }

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ available: false, reason: "These dates are already booked." });
  }

  return NextResponse.json({ available: true });
}
