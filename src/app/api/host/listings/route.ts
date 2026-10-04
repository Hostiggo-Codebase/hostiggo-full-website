import { NextRequest, NextResponse } from "next/server";
import { HotelServiceApi } from "@/lib/services/hotel";
import { createListing } from "@/lib/services/admin-writes";
import { forbiddenResponse, readJsonBody, requireUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // A host's own listings, including drafts and inactive ones.
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const requested = req.nextUrl.searchParams.get("userId");
    if (requested && requested !== userId) return forbiddenResponse();

    const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 24) || 24));

    const { data, total } = await HotelServiceApi.getListingsByHost(userId, offset, limit);
    return NextResponse.json({ data, total });
  } catch (err: any) {
    console.error("[/api/host/listings GET] error:", err?.message);
    return NextResponse.json({ error: "Couldn't load your listings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    if (body.userId && body.userId !== userId) return forbiddenResponse();
    const invalid = validateListingDraft(body);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    // The listing is always created under the caller's own host profile.
    const data = await createListing({ ...body, userId } as any);
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[/api/host/listings POST] error:", err?.message, err?.code, err?.details);
    return NextResponse.json(
      { error: err?.message ?? "Request failed", code: err?.code },
      { status: 500 },
    );
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MAX_NIGHTLY_PRICE = 500000;

/**
 * Server-side twin of the wizard's per-step validation -- the wizard blocks
 * these in the UI, this makes sure nothing that skips it can publish them.
 */
function validateListingDraft(d: Record<string, any>): string | null {
  // Text bounds are looser than the wizard's (50 / 500) because AI-imported
  // listings carry their source's longer title/description.
  const title = String(d.title ?? "").trim();
  if (!title || title.length > 120) return "Add a title (up to 120 characters).";
  const description = String(d.description ?? "").trim();
  if (!description || description.length > 5000) {
    return "Add a description (up to 5000 characters).";
  }
  if (d.requireMinimumPhotos && (!Array.isArray(d.photoUrls) || d.photoUrls.length < 3)) {
    return "Add at least 3 photos before publishing.";
  }
  for (const [label, value] of [["Weekday price", d.priceWeekday], ["Weekend price", d.priceWeekend]] as const) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 100 || n > MAX_NIGHTLY_PRICE) {
      return `${label} must be between ₹100 and ₹${MAX_NIGHTLY_PRICE.toLocaleString("en-IN")} per night.`;
    }
  }
  const guests = Number(d.numGuests ?? 1);
  if (!Number.isInteger(guests) || guests < 1 || guests > 50) return "Guests must be between 1 and 50.";
  for (const key of ["numBedrooms", "numBeds", "numBathrooms"]) {
    if (d[key] == null) continue;
    const n = Number(d[key]);
    if (!Number.isInteger(n) || n < 0 || n > 50) return "Rooms, beds and bathrooms must be between 0 and 50.";
  }
  for (const value of [
    d.checkInTime,
    d.checkOutTime,
    d.houseRules?.check_in_time,
    d.houseRules?.check_out_time,
  ]) {
    if (value != null && value !== "" && !TIME_RE.test(String(value))) {
      return "Check-in and check-out must be valid times (HH:MM).";
    }
  }
  if (Array.isArray(d.discounts)) {
    for (const disc of d.discounts) {
      const p = Number(disc?.percent);
      if (disc?.enabled !== false && (!Number.isFinite(p) || p <= 0 || p > 90)) {
        return "Discounts must be between 1% and 90%.";
      }
    }
  }
  return null;
}
