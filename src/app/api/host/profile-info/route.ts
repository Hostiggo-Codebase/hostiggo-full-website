import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { forbiddenResponse, requireUserId } from "@/lib/auth-server";
import { toE164Phone } from "@/lib/phoneFormat";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // The host's own dashboard profile (includes email + phone).
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const requested = req.nextUrl.searchParams.get("userId");
    if (requested && requested !== userId) return forbiddenResponse();

    // Fetch user from users table
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("name, email, phone, profile_pic_url")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // The phone lives only on the Supabase Auth user: OTP-verified and unique
    // across accounts. It is never copied into the users table.
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const authPhone = toE164Phone(authData?.user?.phone);

    // Fetch host profile
    const { data: hostData, error: hostError } = await supabaseAdmin
      .from("host")
      .select("*")
      .eq("user_id", userId)
      .limit(1);

    if (hostError) {
      console.error("[GET /api/host/profile-info] Host fetch error:", hostError);
      return NextResponse.json({ error: "Failed to fetch host info" }, { status: 500 });
    }

    if (!hostData || hostData.length === 0) {
      return NextResponse.json({ error: "Host profile not found" }, { status: 404 });
    }

    const host = hostData[0];

    // Real listing count for this host.
    const { data: hostListings, error: listingsError } = await supabaseAdmin
      .from("listings")
      .select("listing_id, booking_mode")
      .eq("host_uuid", host.host_uuid);
    if (listingsError) throw listingsError;

    const listingIds = (hostListings ?? []).map((l: any) => l.listing_id);

    // Real review count + average rating across all of this host's listings.
    let reviewCount = 0;
    let avgRating: string = "No ratings";
    if (listingIds.length > 0) {
      const { data: reviews, error: reviewsError } = await supabaseAdmin
        .from("review")
        .select("rating")
        .in("listing_id", listingIds);
      if (reviewsError) throw reviewsError;

      reviewCount = reviews?.length ?? 0;
      if (reviewCount > 0) {
        const sum = reviews!.reduce((acc: number, r: any) => acc + Number(r.rating ?? 0), 0);
        avgRating = (sum / reviewCount).toFixed(1);
      }
    }

    // Build response with the about field from host table
    const responseData = {
      name: user.name || "Host",
      email: user.email,
      phone: authPhone,
      phoneVerified: Boolean(authPhone),
      avatar: user.profile_pic_url || host.photo || null,
      about: host.about || "",  // From host table
      isVerified: host.is_verified || false,
      // On only when every listing is Instant Book; off (request to book) otherwise.
      instantBooking:
        (hostListings ?? []).length > 0 && (hostListings ?? []).every((l: any) => l.booking_mode === "auto"),
      stats: {
        rating: avgRating,
        reviews: reviewCount,
        listings: listingIds.length,
      },
    };

    return NextResponse.json({ data: responseData });
  } catch (err: any) {
    console.error("[GET /api/host/profile-info] Exception:", err);
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}
