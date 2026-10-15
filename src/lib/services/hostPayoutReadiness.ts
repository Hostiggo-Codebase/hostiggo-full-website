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
  phone: "Add your phone number",
  kyc: "Verify your identity (PAN)",
  bank: "Verify your bank account",
  payout: "Complete payout setup",
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

  const [pan, bank, payout, authUser] = await Promise.all([
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
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);
  if (pan.error) throw pan.error;
  if (bank.error) throw bank.error;
  if (payout.error) throw payout.error;

  // Only the phone on the Supabase Auth user counts: it is OTP-verified and
  // unique across accounts. The profile copy (users.phone) is unverified.
  const phoneAdded = !!authUser.data?.user?.phone;
  const kycVerified = !!pan.data;
  const bankVerified = bank.data?.status === "success";
  const p = payout.data;
  const payoutCreated =
    !!p?.razorpay_account_id &&
    !!p?.razorpay_stakeholder_id &&
    !!p?.razorpay_product_id &&
    p.status !== "rejected";

  // Phone number must be first, then KYC, bank, and payout
  const blockers: PayoutBlocker[] = [];
  if (!phoneAdded) blockers.push("phone");
  if (!kycVerified) blockers.push("kyc");
  if (!bankVerified) blockers.push("bank");
  if (!payoutCreated) blockers.push("payout");

  return { ready: blockers.length === 0, blockers, kycVerified, bankVerified, payoutCreated, phoneAdded };
}

/**
 * Whether money for a booking can actually be routed to this host: a complete,
 * non-rejected Razorpay Route account. This is the check a booking must pass;
 * it is narrower than getHostPayoutReadiness (which also gates going live), so
 * an established host isn't blocked by e.g. a later phone/KYC change.
 */
export async function hostHasPayoutAccount(hostUuid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("host_payout_methods")
    .select("razorpay_account_id, razorpay_stakeholder_id, razorpay_product_id, status")
    .eq("host_uuid", hostUuid)
    .maybeSingle();
  if (error) throw error;
  return (
    !!data?.razorpay_account_id &&
    !!data?.razorpay_stakeholder_id &&
    !!data?.razorpay_product_id &&
    data.status !== "rejected"
  );
}

/** Shown to a guest who tries to book a listing whose host can't be paid yet. */
export const HOST_PAYOUT_MISSING_MESSAGE =
  "Sorry for the inconvenience! This host hasn't set up payouts yet, so this property can't be booked right now. Please look at other properties, or check back soon.";

/**
 * Deliberately has no `.code`: finalizeBookingFromRazorpayOrder treats a coded
 * error as a transient database failure and retries, whereas this is a business
 * rejection that must refund the guest.
 */
export class HostPayoutMissingError extends Error {
  constructor() {
    super(HOST_PAYOUT_MISSING_MESSAGE);
    this.name = "HostPayoutMissingError";
  }
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
