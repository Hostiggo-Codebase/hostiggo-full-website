import { NextRequest, NextResponse } from "next/server";
import { createFeedback } from "@/lib/services/admin-writes";
import { optionalUserId, readJsonBody } from "@/lib/auth-server";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(`feedback:${clientIp(req)}`, 5, 10 * 60_000);
    if (limited) return limited;
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    // Feedback may be anonymous; when signed in it's attributed to the
    // verified user, never to a client-supplied id.
    const userId = await optionalUserId(req);
    const { type, description, category, rating, comment } = body;
    // Postgres enums (feedback_type / issue_category) -- reject anything else
    // up front instead of surfacing a database error.
    const TYPES = new Set(["report_issue", "suggest_improvement", "share_experience"]);
    const CATEGORIES = new Set([
      "bookings",
      "payments_payouts",
      "referral_program",
      "listing_management",
      "account_security",
      "app_performance",
      "others",
    ]);
    if (!TYPES.has(String(type))) {
      return NextResponse.json({ error: "Unknown feedback type." }, { status: 400 });
    }
    if (category != null && !CATEGORIES.has(String(category))) {
      return NextResponse.json({ error: "Unknown category." }, { status: 400 });
    }
    if (!type || !description?.trim()) {
      return NextResponse.json(
        { error: "type and description are required" },
        { status: 400 },
      );
    }
    if (String(description).length > 5000) {
      return NextResponse.json(
        { error: "description must be 5000 characters or fewer" },
        { status: 400 },
      );
    }
    const numericRating =
      rating === undefined || rating === null ? null : Number(rating);
    if (numericRating !== null && (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5)) {
      return NextResponse.json(
        { error: "rating must be a whole number between 1 and 5" },
        { status: 400 },
      );
    }
    const data = await createFeedback({
      userId,
      type: String(type),
      description: String(description),
      category: category ?? null,
      rating: numericRating,
      comment: comment ? String(comment).slice(0, 2000) : null,
    });
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[/api/feedback] error:", err?.message, err?.code);
    return NextResponse.json({ error: "We couldn't send that. Please try again." }, { status: 500 });
  }
}
