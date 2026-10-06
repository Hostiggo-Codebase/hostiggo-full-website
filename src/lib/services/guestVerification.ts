import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Guests must have a verified government ID (PAN, Aadhaar or passport) before
 * they can book, by default; set REQUIRE_GUEST_ID_VERIFICATION=false to switch it off. Kept as a flag so
 * the rule can be toggled without a code change.
 */
export const GUEST_ID_REQUIRED = process.env.REQUIRE_GUEST_ID_VERIFICATION !== "false";

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
