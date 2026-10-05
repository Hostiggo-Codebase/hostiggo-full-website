import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Guests must have a verified government ID (PAN, Aadhaar or passport) before
 * they can book, when REQUIRE_GUEST_ID_VERIFICATION=true. Off by default so
 * the rule can be switched on without a deploy of new code.
 */
export const GUEST_ID_REQUIRED = process.env.REQUIRE_GUEST_ID_VERIFICATION === "true";

export async function guestHasVerifiedId(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("kyc_requests")
    .select("id")
    .eq("user_id", userId)
    .in("service_type", ["pan", "aadhaar", "passport"])
    .in("status", ["verified", "success"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
