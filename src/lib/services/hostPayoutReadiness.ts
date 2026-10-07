import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PayoutBlocker = "kyc" | "bank" | "payout" | "phone";

export type HostPayoutReadiness = {
  /** A listing may be live only when this is true. */
  ready: boolean;
  /** What is still missing, in the order the host has to do it. */
  blockers: PayoutBlocker[];
  kycVerified: boolean;
  bankVerified: boolean;
  payoutCreated: boolean;
  phoneAdded: boolean;
};

export const PAYOUT_BLOCKER_MESSAGES: Record<PayoutBlocker, string> = {
  kyc: "Verify your identity with PAN",
  bank: "Verify your bank account",
  payout: "Finish payout setup",
  phone: "Add phone number to your profile",
};

/**
 * Whether a host may have live listings. Order matters, and mirrors how the
 * payout account is created (maybeAutoOnboardHostToRoute): a verified PAN
 * (KYC), then a verified bank account, and only then the Razorpay payout
 * (Route) account. A payout account created any other way doesn't count.
 *
 * Reads are by user id so the rule is identical wherever it is asked.
 */
export async function getHostPayoutReadiness(userId: string): Promise<HostPayoutReadiness> {
  const { data: hostRow, error: hostErr } = await supabaseAdmin
    .from("host")
    .select("host_uuid")
    .eq("user_id", userId)
    .maybeSingle();
  if (hostErr) throw hostErr;

  const [pan, bank, payout, user] = await Promise.all([
    supabaseAdmin
      .from("kyc_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("service_type", "pan")
      .eq("status", "verified")
      .limit(1)
      .maybeSingle(),
    // Latest bank attempt decides: a later failed attempt means the saved
    // account is no longer the verified one.
    supabaseAdmin
      .from("kyc_requests")
      .select("status")
      .eq("user_id", userId)
      .eq("service_type", "bank")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    hostRow?.host_uuid
      ? supabaseAdmin
          .from("host_payout_methods")
          .select("razorpay_account_id, razorpay_stakeholder_id, razorpay_product_id, status")
          .eq("host_uuid", hostRow.host_uuid)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("users")
      .select("phone")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (pan.error) throw pan.error;
  if (bank.error) throw bank.error;
  if (payout.error) throw payout.error;
  if (user.error) throw user.error;

  const kycVerified = !!pan.data;
  const bankVerified = bank.data?.status === "success";
  const p = payout.data;
  const payoutCreated =
    !!p?.razorpay_account_id &&
    !!p?.razorpay_stakeholder_id &&
    !!p?.razorpay_product_id &&
    p.status !== "rejected";
  const phoneAdded = !!user.data?.phone;

  const blockers: PayoutBlocker[] = [];
  if (!phoneAdded) blockers.push("phone");
  if (!kycVerified) blockers.push("kyc");
  if (!bankVerified) blockers.push("bank");
  if (!payoutCreated) blockers.push("payout");

  return { ready: blockers.length === 0, blockers, kycVerified, bankVerified, payoutCreated, phoneAdded };
}

export class PayoutNotReadyError extends Error {
  readonly blockers: PayoutBlocker[];
  constructor(blockers: PayoutBlocker[]) {
    super(
      `Your listing can go live once payouts are set up: ${blockers
        .map((b) => PAYOUT_BLOCKER_MESSAGES[b].toLowerCase())
        .join(", then ")}.`,
    );
    this.blockers = blockers;
  }
}
