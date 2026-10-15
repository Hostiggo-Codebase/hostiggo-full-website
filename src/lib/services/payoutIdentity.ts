import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/surepass";

// One person, one Hostiggo account: a PAN or a bank account can back the
// payout setup of exactly one host. (A phone number is already unique -- it
// lives on the Supabase Auth user, which rejects a number another account
// holds.) Checked before any SurePass lookup so a duplicate costs no quota,
// and backed by unique indexes in the database.

export const DUPLICATE_PAN_MESSAGE =
  "This PAN is already linked to another Hostiggo account. Each person can have only one host account -- sign in with that account instead.";
export const DUPLICATE_BANK_MESSAGE =
  "This bank account is already linked to another Hostiggo account. Each person can have only one host account -- sign in with that account instead.";

/** Collapse whitespace and strip anything Razorpay won't take in a person's name. */
export function cleanPersonName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[^A-Za-z\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the user-facing reason if the PAN or bank account is already used by
 * a different host's payout setup, otherwise null.
 */
export async function findPayoutConflict(
  hostUuid: string | null,
  fields: { pan?: string | null; accountNumber?: string | null },
): Promise<string | null> {
  const clash = async (column: "pan_number" | "bank_account_number", value: string) => {
    let query = supabaseAdmin.from("host_payout_methods").select("host_uuid").eq(column, value).limit(1);
    if (hostUuid) query = query.neq("host_uuid", hostUuid);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return Boolean(data);
  };
  if (fields.pan && (await clash("pan_number", fields.pan.toUpperCase()))) return DUPLICATE_PAN_MESSAGE;
  if (fields.accountNumber && (await clash("bank_account_number", fields.accountNumber))) {
    return DUPLICATE_BANK_MESSAGE;
  }
  return null;
}

/**
 * Name on the user's latest PAN verified by SurePass -- the legal name
 * Razorpay's KYC checks against.
 */
export async function verifiedPanName(userId: string): Promise<string | null> {
  const { data: request } = await supabaseAdmin
    .from("kyc_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("service_type", "pan")
    .eq("status", "verified")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!request) return null;
  const { data } = await supabaseAdmin
    .from("pan_verifications")
    .select("full_name")
    .eq("kyc_request_id", request.id)
    .maybeSingle();
  const name = cleanPersonName(data?.full_name);
  return name || null;
}

/**
 * The SurePass-verified record for exactly this account number: the IFSC and
 * holder name SurePass confirmed, or null when this number was never verified
 * for the user. Payout onboarding sends these, not whatever is typed in a form.
 */
export async function verifiedBankRecord(
  userId: string,
  accountNumber: string,
): Promise<{ ifsc: string; holderName: string | null } | null> {
  const { data: requests } = await supabaseAdmin
    .from("kyc_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("service_type", "bank")
    .eq("status", "success");
  const ids = (requests ?? []).map((r) => r.id);
  if (ids.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("bank_verifications")
    .select("ifsc_code, account_holder_name")
    .in("kyc_request_id", ids)
    .eq("is_valid", true)
    .eq("account_hash", sha256Hex(accountNumber))
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.ifsc_code) return null;
  return { ifsc: String(data.ifsc_code).toUpperCase(), holderName: cleanPersonName(data.account_holder_name) || null };
}

/**
 * The phone on the Supabase Auth user (verified by OTP), as a bare 10-digit
 * Indian number, or null if the account has none.
 */
export async function authPhoneTenDigits(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  const digits = String(data.user?.phone ?? "").replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : null;
}
