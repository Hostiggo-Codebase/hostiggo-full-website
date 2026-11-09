import { NextRequest, NextResponse } from "next/server";
import { createReview, getReviewEligibility, ReviewNotAllowedError } from "@/lib/services/admin-writes";
import { forbiddenResponse, readJsonBody, requireUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** GET /api/reviews?listingId= -- may the signed-in user review this listing? */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const listingId = Number(req.nextUrl.searchParams.get("listingId"));
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    const data = await getReviewEligibility(listingId, userId);
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[/api/reviews GET] error:", err?.message, err?.code);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    const { listingId, rating, comment } = body;
    if (body.userId && body.userId !== userId) return forbiddenResponse();
    if (!listingId || !rating) {
      return NextResponse.json(
        { error: "listingId and rating are required" },
        { status: 400 },
      );
    }
    // The review table has no CHECK constraint on rating, so an out-of-range
    // value (0, 999, 4.7) would silently poison every average computed from
    // it -- enforce the 1-5 integer scale the UI offers.
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return NextResponse.json(
        { error: "rating must be a whole number between 1 and 5" },
        { status: 400 },
      );
    }
    if (comment != null && String(comment).length > 2000) {
      return NextResponse.json(
        { error: "comment must be 2000 characters or fewer" },
        { status: 400 },
      );
    }
    const data = await createReview({
      listingId: Number(listingId),
      userId,
      rating: numericRating,
      comment: comment ? String(comment).trim() || null : null,
    });
    return NextResponse.json({ data });
  } catch (err: any) {
    if (err instanceof ReviewNotAllowedError) return forbiddenResponse(err.message);
    console.error("[/api/reviews] error:", err?.message, err?.code);
    return NextResponse.json({ error: err?.message ?? "Request failed", code: err?.code }, { status: 500 });
  }
}
