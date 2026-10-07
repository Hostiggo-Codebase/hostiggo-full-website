import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isSurepassConfigured, surepassPost, maskMiddle, sha256Hex, logKycRequest } from "@/lib/surepass";
import { rateLimit } from "@/lib/rateLimit";

// Shared SurePass verification, used by /api/verify/bank, /api/verify/pan
// and by /api/host/payout-methods when a host edits their bank or PAN --
// so every change to either goes through SurePass, whichever screen made it.

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_RE = /^\d{9,18}$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

const BANK_VERIFICATION_ENDPOINT = "/api/v1/bank-verification/";
const PAN_COMPREHENSIVE_ENDPOINT = "/api/v1/pan/pan-comprehensive";

const HONORIFICS = new Set(["MR", "MRS", "MS", "MISS", "DR", "SHRI", "SRI", "SMT", "KUM", "M/S"]);

const nameTokens = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));

/**
 * Whether the name the user typed matches the name the provider has on
 * record (PAN / bank). Case, punctuation, word order and honorifics are
 * ignored. Every word the user typed must appear in the record, but the
 * record may carry extra words (a middle name on PAN, say) -- as long as
 * at least two words line up (or the record's only word, for mononyms), so
 * a bare first name can't pass. A single-letter word on either side counts
 * as an initial ("D BHASIN" ~ "DAKSH BHASIN").
 */
export function namesMatch(entered: string, onRecord: string): boolean {
  const mine = nameTokens(entered);
  const theirs = nameTokens(onRecord);
  if (!mine.length || !theirs.length) return false;

  const remaining = [...theirs];
  const take = (token: string) => {
    let i = remaining.indexOf(token);
    if (i === -1) {
      i = remaining.findIndex(
        (t) => (token.length === 1 && t.startsWith(token)) || (t.length === 1 && token.startsWith(t)),
      );
    }
    if (i === -1) return false;
    remaining.splice(i, 1);
    return true;
  };
  if (!mine.every(take)) return false;
  return mine.length >= Math.min(2, theirs.length);
}

// Same person either way round -- one record may carry a middle name the
// other drops (PAN "DAKSH KUMAR BHASIN", bank "DAKSH BHASIN"), and the form
// has a single name field for both. A name padded with a second person's
// words could match each record alone, but not the PAN-vs-bank cross-check.
export const samePerson = (a: string, b: string) => namesMatch(a, b) || namesMatch(b, a);

// Name on the user's most recent successful PAN / bank verification, if
// any. Used to cross-check the other one, so a user can't verify their own
// PAN and then, after editing the typed name, someone else's bank account
// (or the reverse) -- each check alone would only see the typed name.
async function latestVerifiedName(userId: string, kind: "pan" | "bank"): Promise<string | null> {
  const { data: request } = await supabaseAdmin
    .from("kyc_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("service_type", kind)
    .eq("status", kind === "pan" ? "verified" : "success")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!request) return null;
  let name: unknown = null;
  if (kind === "pan") {
    const { data } = await supabaseAdmin
      .from("pan_verifications")
      .select("full_name")
      .eq("kyc_request_id", request.id)
      .maybeSingle();
    name = data?.full_name;
  } else {
    const { data } = await supabaseAdmin
      .from("bank_verifications")
      .select("account_holder_name")
      .eq("kyc_request_id", request.id)
      .maybeSingle();
    name = data?.account_holder_name;
  }
  return typeof name === "string" && name ? name : null;
}

const crossCheckReason = (what: "PAN" | "bank account", other: "PAN" | "bank account") =>
  `The name on this ${what} doesn't match the name on the ${other} you already verified. Both must be in your name.`;

// Deliberately doesn't echo the name on record -- that would let anyone
// look up whose PAN / account a number belongs to.
const nameMismatchReason = (what: "PAN" | "bank account", onRecord: string | null) =>
  onRecord
    ? `The name you entered doesn't match the name on this ${what}. Enter your name exactly as it appears on your ${what}.`
    : `We couldn't confirm the name on this ${what}. Please check the details and try again.`;

export type BankVerificationResult =
  | {
      verified: true;
      accountHolderName: string | null;
      upiId: string | null;
      bankName: string | null;
      branch: string | null;
      providerReference: string | null;
    }
  | { verified: false; reason: string | null; rateLimited?: boolean };

export async function verifyBankAccount(
  userId: string,
  accountNumber: string,
  ifsc: string,
  expectedName?: string | null,
): Promise<BankVerificationResult> {
  if (!isSurepassConfigured()) {
    return { verified: false, reason: "Bank verification is not configured yet (missing SUREPASS_API_KEY)." };
  }

  // Every call here spends SurePass quota, and repeated clicks while SurePass is
  // already throttling just extend the throttle. Cap real lookups per user; the
  // caller shows this message instead of hitting the provider again.
  if (await rateLimit(`bank-verify:${userId}`, 3, 10 * 60_000)) {
    return {
      verified: false,
      rateLimited: true,
      reason: "Too many bank verification attempts. Please wait about 10 minutes and try again.",
    };
  }

  const logAttempt = (params: { status: string; providerReference: string | null; errorMessage: string | null }) =>
    logKycRequest({
      userId,
      serviceType: "bank",
      maskedId: maskMiddle(accountNumber),
      status: params.status,
      providerReference: params.providerReference,
      errorMessage: params.errorMessage,
    });

  const res = await surepassPost(BANK_VERIFICATION_ENDPOINT, {
    id_number: accountNumber,
    ifsc,
    ifsc_details: true,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.success) {
    console.error("[kycVerify] bank error:", res.status, json);
    // A provider throttle says nothing about the account itself. Don't log it
    // as a failed verification: payout onboarding keys off the latest bank
    // attempt, so a throttled retry would otherwise block an account that was
    // already verified.
    if (res.status === 429 || /rate limit/i.test(String(json?.message ?? ""))) {
      return {
        verified: false,
        rateLimited: true,
        reason: "Bank verification is busy right now. Please wait a few minutes and try again.",
      };
    }
    const reason = json?.message || `Verification provider error (${res.status}).`;
    await logAttempt({ status: "failed", providerReference: null, errorMessage: reason });
    return { verified: false, reason };
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const ifscDetails = (data.ifsc_details as Record<string, unknown> | undefined) ?? {};
  const providerReference = typeof data.client_id === "string" ? data.client_id : null;
  const holderName = typeof data.full_name === "string" ? data.full_name : null;
  const accountExists = data.account_exists === true;
  const nameOk =
    !expectedName || (holderName !== null && samePerson(expectedName, holderName));
  const panName = accountExists && nameOk && holderName ? await latestVerifiedName(userId, "pan") : null;
  const matchesPan = !panName || !holderName || samePerson(holderName, panName);
  const verified = accountExists && nameOk && matchesPan;
  const reason = verified
    ? null
    : !accountExists
      ? (typeof data.remarks === "string" && data.remarks) || "Could not verify that bank account."
      : !nameOk
        ? nameMismatchReason("bank account", holderName)
        : crossCheckReason("bank account", "PAN");
  const bankName = (ifscDetails.bank_name ?? ifscDetails.bank ?? null) as string | null;

  const kycRequestId = await logAttempt({
    status: verified ? "success" : "failed",
    providerReference,
    errorMessage: reason,
  });
  if (kycRequestId) {
    await supabaseAdmin.from("bank_verifications").insert({
      kyc_request_id: kycRequestId,
      account_hash: sha256Hex(accountNumber),
      account_last4: accountNumber.slice(-4),
      ifsc_code: ifsc,
      account_holder_name: data.full_name ?? null,
      bank_name: bankName,
      is_valid: verified,
    });
  }

  if (!verified) return { verified: false, reason };

  // Keep the host's bank profile (host_bank_details) in step.
  const { data: hostRow } = await supabaseAdmin
    .from("host")
    .select("host_uuid")
    .eq("user_id", userId)
    .maybeSingle();
  if (hostRow?.host_uuid) {
    const { upsertHostBankDetails } = await import("@/lib/services/hostBankDetails");
    await upsertHostBankDetails({
      hostUuid: hostRow.host_uuid,
      accountName: typeof data.full_name === "string" ? data.full_name : null,
      accountNumber,
      ifsc,
      branchName: typeof ifscDetails.branch === "string" ? ifscDetails.branch : null,
      upiId: typeof data.upi_id === "string" ? data.upi_id : null,
    });
  }

  return {
    verified: true,
    accountHolderName: typeof data.full_name === "string" ? data.full_name : null,
    upiId: typeof data.upi_id === "string" ? data.upi_id : null,
    bankName,
    branch: typeof ifscDetails.branch === "string" ? ifscDetails.branch : null,
    providerReference,
  };
}

export type PanVerificationResult = {
  status: "verified" | "rejected" | "pending";
  reason: string | null;
  providerReference: string | null;
  fullName: string | null;
};

export async function verifyPanNumber(
  userId: string,
  pan: string,
  expectedName?: string | null,
): Promise<PanVerificationResult> {
  if (!isSurepassConfigured()) {
    return {
      status: "pending",
      reason: "Identity verification is not configured yet (missing SUREPASS_API_KEY).",
      providerReference: null,
      fullName: null,
    };
  }

  const res = await surepassPost(PAN_COMPREHENSIVE_ENDPOINT, { id_number: pan });
  const json = await res.json().catch(() => ({}));

  let status: "verified" | "rejected";
  let reason: string | null = null;
  let providerReference: string | null = null;
  let data: Record<string, unknown> | null = null;

  if (!res.ok || !json?.success) {
    console.error("[kycVerify] pan error:", res.status, json);
    status = "rejected";
    reason = json?.message || "Could not verify that PAN.";
  } else {
    data = (json.data ?? {}) as Record<string, unknown>;
    providerReference = typeof data.client_id === "string" ? data.client_id : null;
    const panName = typeof data.full_name === "string" ? data.full_name : null;
    const bankName = panName ? await latestVerifiedName(userId, "bank") : null;
    if (expectedName && !(panName && samePerson(expectedName, panName))) {
      status = "rejected";
      reason = nameMismatchReason("PAN", panName);
    } else if (panName && bankName && !samePerson(panName, bankName)) {
      status = "rejected";
      reason = crossCheckReason("PAN", "bank account");
    } else {
      status = "verified";
    }
  }

  const kycRequestId = await logKycRequest({
    userId,
    serviceType: "pan",
    maskedId: maskMiddle(pan),
    status,
    providerReference,
    errorMessage: reason,
  });
  if (kycRequestId) {
    await supabaseAdmin.from("pan_verifications").insert({
      kyc_request_id: kycRequestId,
      pan_number_masked: maskMiddle(pan),
      full_name: data?.full_name ?? null,
      aadhaar_seeding_status: typeof data?.aadhaar_linked === "boolean" ? String(data.aadhaar_linked) : null,
      is_valid: status === "verified",
    });
  }

  return {
    status,
    reason,
    providerReference,
    fullName: typeof data?.full_name === "string" ? data.full_name : null,
  };
}
