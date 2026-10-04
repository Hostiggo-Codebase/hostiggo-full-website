import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createLinkedAccount,
  createStakeholder,
  createRouteProduct,
  submitRouteSettlementDetails,
  updateLinkedAccount,
  updateStakeholder,
} from "@/lib/billing/razorpayRoute";

/**
 * The actual 4-step Route setup -- Account -> Stakeholder -> create Product
 * config -> submit settlement bank details against that product config --
 * verified against a real Razorpay test-mode account (bank details do NOT
 * go on the Stakeholder; they go in a separate step against the product
 * config's own id, see razorpayRoute.ts). Shared by both
 * /api/host/create-linked-account (a host manually retrying/resuming) and
 * maybeAutoOnboardHostToRoute below (automatic trigger, no separate
 * authenticated call needed). Idempotent/resumable: persists each id right
 * after it's returned, so a failure partway through only retries what's
 * left -- including step 4 alone, which is the one expected to need
 * retrying in practice (Razorpay penny-tests the bank account and will
 * reject a wrong number/IFSC after a delay, well after this function has
 * already returned).
 *
 * An upsert, not create-only: when a host changes their details the
 * Razorpay ids are kept (status drops back to 'submitted'), and this
 * PATCHes the existing Linked Account and Stakeholder before resubmitting
 * the settlement bank details -- Razorpay won't open a second account for
 * the same email.
 */
export async function runRouteOnboarding(hostUuid: string, userId: string) {
  const { data: payout, error: payoutError } = await supabaseAdmin
    .from("host_payout_methods")
    .select(
      "account_holder_name, bank_account_number, bank_ifsc, pan_number, address_line1, city, state, postal_code, razorpay_account_id, razorpay_stakeholder_id, razorpay_product_id, status",
    )
    .eq("host_uuid", hostUuid)
    .maybeSingle();
  if (payoutError) throw payoutError;
  if (!payout) {
    throw new Error("No payout details on file for this host yet.");
  }
  if (
    payout.razorpay_account_id &&
    payout.razorpay_stakeholder_id &&
    payout.razorpay_product_id &&
    payout.status === "active"
  ) {
    return { razorpayAccountId: payout.razorpay_account_id, status: payout.status };
  }

  if (!payout.bank_account_number || !payout.bank_ifsc) {
    throw new Error("Add and verify your bank account in Settings to finish payout setup.");
  }

  if (!payout.pan_number) {
    // Razorpay Route's stakeholder KYC needs a PAN -- payouts can't
    // activate without one.
    throw new Error("Add your PAN in Settings to finish payout setup -- Razorpay requires it.");
  }

  if (!payout.address_line1 || !payout.city || !payout.state || !payout.postal_code) {
    throw new Error("Add your address, city, state and postal code in Settings to finish payout setup -- Razorpay requires them.");
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("email, phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (userError) throw userError;
  // Razorpay wants a bare 10-digit number -- stored phones may carry spaces,
  // dashes or a +91 / 0 prefix.
  const phone = String(userRow?.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!userRow?.email || phone.length !== 10) {
    throw new Error("Add your email and a 10-digit phone number in Settings -> Personal Info to finish payout setup.");
  }

  let accountId = payout.razorpay_account_id;
  let stakeholderId = payout.razorpay_stakeholder_id;
  let productId = payout.razorpay_product_id;

  const accountDetails = {
    phone,
    legalBusinessName: payout.account_holder_name,
    contactName: payout.account_holder_name,
    addressLine1: payout.address_line1,
    city: payout.city,
    state: payout.state,
    postalCode: payout.postal_code,
  };
  const stakeholderDetails = {
    name: payout.account_holder_name,
    email: userRow.email,
    panNumber: payout.pan_number,
  };

  if (accountId) {
    await updateLinkedAccount(accountId, accountDetails);
  } else {
    const account = await createLinkedAccount({ ...accountDetails, email: userRow.email, referenceId: hostUuid });
    accountId = account.id;
    await supabaseAdmin
      .from("host_payout_methods")
      .update({ razorpay_account_id: accountId, status: "onboarding", updated_at: new Date().toISOString() })
      .eq("host_uuid", hostUuid);
  }

  if (stakeholderId) {
    await updateStakeholder(accountId, stakeholderId, stakeholderDetails);
  } else {
    const stakeholder = await createStakeholder(accountId, stakeholderDetails);
    stakeholderId = stakeholder.id;
    await supabaseAdmin
      .from("host_payout_methods")
      .update({ razorpay_stakeholder_id: stakeholderId, updated_at: new Date().toISOString() })
      .eq("host_uuid", hostUuid);
  }

  if (!productId) {
    const product = await createRouteProduct(accountId);
    productId = product.id;
    await supabaseAdmin
      .from("host_payout_methods")
      .update({ razorpay_product_id: productId, updated_at: new Date().toISOString() })
      .eq("host_uuid", hostUuid);
  }

  const resolved = await submitRouteSettlementDetails(accountId, productId, {
    accountNumber: payout.bank_account_number,
    ifscCode: payout.bank_ifsc,
    beneficiaryName: payout.account_holder_name,
  });
  // 'needs_clarification' is the expected status right after submitting --
  // Razorpay penny-tests the account asynchronously and only reaches
  // 'activated' once that succeeds, which this function has no way to wait
  // for. See /api/host/onboarding-status for polling that.
  const finalStatus = resolved.activation_status === "activated" ? "active" : "onboarding";
  await supabaseAdmin
    .from("host_payout_methods")
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq("host_uuid", hostUuid);

  await transferPendingBookings(hostUuid, accountId).catch((err) =>
    console.error(`[runRouteOnboarding] could not back-fill transfers for host ${hostUuid}:`, err),
  );

  const { notify } = await import("@/lib/services/notifications");
  await notify({
    userId,
    type: "booking_host",
    category: "account",
    title: "Payouts are set up",
    message: "Your payout account is ready. You can now take your listings live from Your Listings.",
    metadata: { role: "host" },
  });

  return { razorpayAccountId: accountId, status: finalStatus };
}

/**
 * Bookings paid before the host had a Route account were never split off
 * (createHostTransferForBooking skips hosts without one, leaving
 * transfer_status null), so those earnings would sit with Hostiggo forever.
 * Once the host is onboarded this sends the share frozen on each such
 * upcoming, still-confirmed booking (host_payout_paise), and retries earlier
 * failures. Per-booking idempotency keys match the original path, so a
 * repeat run cannot double-pay.
 */
async function transferPendingBookings(hostUuid: string, linkedAccountId: string) {
  const { data: bookings, error } = await supabaseAdmin
    .from("bookings")
    .select("booking_id, start_date, razorpay_payment_id, host_payout_paise, listings(check_in_time)")
    .eq("host_uuid", hostUuid)
    .eq("status_id", 2)
    .not("razorpay_payment_id", "is", null)
    .gt("host_payout_paise", 0)
    .or("transfer_status.is.null,transfer_status.eq.failed");
  if (error) throw error;

  const { createTransferForPayment } = await import("@/lib/billing/razorpayRoute");
  const { payoutReleaseMoment } = await import("@/lib/billing/policyTimeline");
  for (const b of (bookings ?? []) as any[]) {
    try {
      const result = await createTransferForPayment(b.razorpay_payment_id, {
        linkedAccountId,
        amountPaise: Number(b.host_payout_paise),
        notes: { bookingId: String(b.booking_id) },
        onHoldUntil: payoutReleaseMoment(b.start_date, b.listings?.check_in_time),
        idempotencyKey: `transfer:${b.booking_id}`,
      });
      await supabaseAdmin
        .from("bookings")
        .update({ razorpay_transfer_id: result.items?.[0]?.id ?? null, transfer_status: "created" })
        .eq("booking_id", b.booking_id);
    } catch (err) {
      console.error(`[transferPendingBookings] booking ${b.booking_id} failed:`, err);
    }
  }
}

export type VerifiedPayoutFields = {
  accountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  panNumber?: string | null;
};

/**
 * Copies details a host just verified (/api/verify/pan, /api/verify/bank)
 * into host_payout_methods, so Settings -> Payouts opens pre-filled and the
 * host only has to add their address. With no fields passed, it just
 * creates the row from the host's already-verified bank account
 * (host_bank_details), for hosts who verified before this existed.
 * The holder name is only filled in when none is saved yet. No-op for
 * non-hosts; fail-soft.
 */
export async function saveVerifiedPayoutDetails(userId: string, fields: VerifiedPayoutFields = {}): Promise<void> {
  try {
    const { data: hostRow } = await supabaseAdmin
      .from("host")
      .select("host_uuid")
      .eq("user_id", userId)
      .maybeSingle();
    if (!hostRow?.host_uuid) return;
    const hostUuid = hostRow.host_uuid;

    const { data: existing } = await supabaseAdmin
      .from("host_payout_methods")
      .select("account_holder_name, bank_account_number, bank_ifsc, pan_number")
      .eq("host_uuid", hostUuid)
      .maybeSingle();

    let { accountHolderName, bankAccountNumber, bankIfsc } = fields;
    if (!existing && !bankAccountNumber) {
      const { data: verifiedBank } = await supabaseAdmin
        .from("kyc_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("service_type", "bank")
        .eq("status", "success")
        .limit(1)
        .maybeSingle();
      if (verifiedBank) {
        const { data: bank } = await supabaseAdmin
          .from("host_bank_details")
          .select("bank_account_name, bank_account_number, bank_ifsc_code")
          .eq("host_uuid", hostUuid)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();
        bankAccountNumber = bank?.bank_account_number ?? null;
        bankIfsc = bank?.bank_ifsc_code ?? null;
        accountHolderName ||= bank?.bank_account_name?.replace(/\s+/g, " ").trim() ?? null;
      }
    }

    const changes: Record<string, string> = {};
    const setIfChanged = (column: keyof NonNullable<typeof existing>, value: string | null | undefined) => {
      if (value && value !== existing?.[column]) changes[column] = value;
    };
    if (!existing?.account_holder_name) setIfChanged("account_holder_name", accountHolderName?.trim());
    setIfChanged("bank_account_number", bankAccountNumber);
    setIfChanged("bank_ifsc", bankIfsc);
    setIfChanged("pan_number", fields.panNumber);
    if (Object.keys(changes).length === 0) return;

    // Same as a Settings edit: new bank/PAN details are pushed to the
    // existing Razorpay linked account on the next onboarding run.
    const reset = { status: "submitted", updated_at: new Date().toISOString() };
    if (existing) {
      const { error } = await supabaseAdmin
        .from("host_payout_methods")
        .update({ ...changes, ...reset })
        .eq("host_uuid", hostUuid);
      if (error) throw error;
    } else {
      // NOT NULL columns not known yet are stored empty, as in the Settings save.
      const { error } = await supabaseAdmin.from("host_payout_methods").insert({
        host_uuid: hostUuid,
        account_holder_name: "",
        bank_account_number: "",
        bank_ifsc: "",
        pan_number: "",
        address_line1: "",
        city: "",
        state: "",
        postal_code: "",
        ...changes,
        ...reset,
      });
      if (error) throw error;
    }
  } catch (err) {
    console.error(`[saveVerifiedPayoutDetails] failed for user ${userId}:`, err);
  }
}

/**
 * Called from inside the verification routes themselves
 * (/api/verify/pan, /api/verify/bank) right after each
 * records a 'verified'/'success' result -- not exposed as its own HTTP
 * endpoint, so there's no separate auth check to add here: the caller
 * (whichever verification route just ran) already authenticated this
 * userId. Fully fail-soft by design: a verification response must never be
 * held up or fail because Route onboarding did. Returns the failure
 * message (null if it succeeded or had nothing to do), so a caller that
 * wants to can show the host why payouts aren't set up yet.
 *
 * Fires the Route setup once BOTH are true:
 *   1. Bank account verified -- latest kyc_requests row for this user with
 *      service_type = 'bank' and status = 'success' (see /api/verify/bank).
 *   2. PAN verified -- any kyc_requests row with service_type = 'pan'
 *      and status = 'verified' (see /api/verify/pan).
 * Only ever acts on users who already have a host profile -- a guest
 * completing ordinary identity verification at login must never trigger
 * Razorpay account creation.
 */
export async function maybeAutoOnboardHostToRoute(userId: string): Promise<string | null> {
  try {
    const { data: hostRow } = await supabaseAdmin
      .from("host")
      .select("host_uuid")
      .eq("user_id", userId)
      .maybeSingle();
    if (!hostRow?.host_uuid) return null;
    const hostUuid = hostRow.host_uuid;

    const { data: payout } = await supabaseAdmin
      .from("host_payout_methods")
      .select("razorpay_account_id, razorpay_stakeholder_id, status")
      .eq("host_uuid", hostUuid)
      .maybeSingle();
    // No bank details on file yet, or already onboarded with nothing new to
    // push -- nothing to do. A details change resets status to 'submitted',
    // so it gets upserted to Razorpay here.
    if (
      !payout ||
      (payout.razorpay_account_id &&
        payout.razorpay_stakeholder_id &&
        (payout.status === "active" || payout.status === "onboarding"))
    ) {
      return null;
    }

    const { data: bankRequest } = await supabaseAdmin
      .from("kyc_requests")
      .select("status")
      .eq("user_id", userId)
      .eq("service_type", "bank")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bankRequest?.status !== "success") return null;

    // Any verified PAN counts, even if a later retry was rejected -- same
    // rule as /api/kyc/status and the payout-methods save check.
    const { data: verifiedPan } = await supabaseAdmin
      .from("kyc_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("service_type", "pan")
      .eq("status", "verified")
      .limit(1)
      .maybeSingle();
    if (!verifiedPan) return null;

    await runRouteOnboarding(hostUuid, userId);
    return null;
  } catch (err) {
    console.error(`[maybeAutoOnboardHostToRoute] failed for user ${userId}:`, err);
    return err instanceof Error ? err.message : "Payout setup failed.";
  }
}
