import "server-only";

// Route Linked Accounts: split each guest payment so a portion settles
// directly to the host, instead of Hostiggo receiving 100% and pushing a
// payout later. This is a DIFFERENT Razorpay product from the RazorpayX
// Payouts helpers in razorpay.ts (createRazorpayPayout) -- that path is not
// used for host settlement; Route is the model this app onboards hosts
// against (see host_payout_methods' own schema comments, written for Route
// from the start: razorpay_account_id / razorpay_stakeholder_id).
//
// Onboarding a host is a 3-step process against Razorpay's own API,
// authenticated with Hostiggo's own primary account credentials (the host
// never gets separate Razorpay API keys):
//   1. POST /v2/accounts                    -- create the Linked Account (acc_xxxxx)
//   2. POST /v2/accounts/{id}/stakeholders  -- attach the individual's KYC + bank details
//   3. POST /v2/accounts/{id}/products      -- activate the "route" product on it
// Called via raw REST (Basic Auth with RAZORPAY_KEY_ID/SECRET) rather than
// the `razorpay` npm SDK, same reasoning as createRazorpayPayout()'s
// fallback comment: Route's v2 accounts API isn't reliably typed across
// SDK versions, and a raw fetch is trivial to smoke-test with curl.
//
// IMPORTANT -- unverified against a live account: built from Razorpay's
// public Route API documentation, but this repo has never had Razorpay
// credentials available to test against (see billing/README.md), and Route
// specifically may not even be enabled/approved on this merchant account
// yet (a separate approval from having Orders/Payments working) -- confirm
// with Razorpay's account manager, then smoke-test each step against a
// real test-mode account before trusting this in production.

const RAZORPAY_API_BASE = "https://api.razorpay.com";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

export class RazorpayRouteError extends Error {
  constructor(
    message: string,
    public status: number,
    public razorpay: unknown,
  ) {
    super(message);
  }
}

function authHeader(): string {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set to call the Route API.");
  }
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

async function routeRequest<T>(
  path: string,
  method: "POST" | "GET" | "PATCH",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (json as any)?.error?.description || `Razorpay Route API error (${res.status})`;
    throw new RazorpayRouteError(message, res.status, json);
  }
  return json as T;
}

export type CreateLinkedAccountParams = {
  email: string;
  phone: string;
  legalBusinessName: string;
  contactName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  /** Hostiggo's own host_uuid, so the Linked Account can be traced back to it from the Razorpay dashboard. */
  referenceId: string;
};

export type LinkedAccountResult = { id: string; status: string };

export async function createLinkedAccount(
  params: CreateLinkedAccountParams,
): Promise<LinkedAccountResult> {
  return routeRequest<LinkedAccountResult>("/v2/accounts", "POST", {
    email: params.email,
    phone: params.phone,
    type: "route",
    // Verified: this field 20-char max ("The code may not be greater than
    // 20 characters") -- a host_uuid (36 chars incl. dashes) blows past it.
    // Just a dashboard trace field, not a lookup key we ever read back, so
    // truncating is safe; collision odds across hosts are negligible.
    reference_id: params.referenceId.replace(/-/g, "").slice(0, 20),
    legal_business_name: params.legalBusinessName,
    business_type: "individual",
    contact_name: params.contactName,
    profile: {
      // Verified against a real test-mode account -- "hospitality" /
      // "guest_house" (the initial guess) is rejected outright with
      // "Invalid business subcategory for business category". This is the
      // pairing Razorpay's own category/subcategory reference lists for a
      // homestay/vacation-rental marketplace host.
      category: "tours_and_travel",
      subcategory: "accommodation",
      addresses: {
        registered: {
          street1: params.addressLine1,
          // Verified: street2 is REQUIRED and rejects an empty string --
          // host_payout_methods only collects one address line, so this
          // repeats it rather than leaving it blank.
          street2: params.addressLine1,
          city: params.city,
          state: params.state,
          postal_code: params.postalCode,
          country: "IN",
        },
      },
    },
  });
}

export type UpdateLinkedAccountParams = Omit<CreateLinkedAccountParams, "email" | "referenceId">;

// The "update" half of the upsert in runRouteOnboarding: once a host has a
// Linked Account, changed details are PATCHed onto it rather than creating
// a second one (Razorpay rejects a new account for an email that already
// has one). email and reference_id are fixed at creation.
export async function updateLinkedAccount(
  accountId: string,
  params: UpdateLinkedAccountParams,
): Promise<LinkedAccountResult> {
  return routeRequest<LinkedAccountResult>(`/v2/accounts/${accountId}`, "PATCH", {
    phone: params.phone,
    legal_business_name: params.legalBusinessName,
    contact_name: params.contactName,
    profile: {
      addresses: {
        registered: {
          street1: params.addressLine1,
          street2: params.addressLine1,
          city: params.city,
          state: params.state,
          postal_code: params.postalCode,
          country: "IN",
        },
      },
    },
  });
}

export type CreateStakeholderParams = {
  name: string;
  email: string;
  panNumber: string;
};

export async function createStakeholder(
  accountId: string,
  params: CreateStakeholderParams,
): Promise<{ id: string }> {
  // Verified against a real test-mode account: bank_account is NOT a valid
  // field here at all ("bank_account is/are not required and should not be
  // sent") -- bank details go on the Route product config instead, see
  // activateRouteProduct below. Also verified: kyc.pan must be a PAN whose
  // 4th character is "P" (the individual-entity marker) or this 400s with
  // "The pan field is invalid" -- a real host's individual PAN already has
  // this by construction, so no extra validation needed on our side.
  return routeRequest<{ id: string }>(`/v2/accounts/${accountId}/stakeholders`, "POST", {
    name: params.name,
    email: params.email,
    kyc: { pan: params.panNumber },
  });
}

export async function updateStakeholder(
  accountId: string,
  stakeholderId: string,
  params: CreateStakeholderParams,
): Promise<{ id: string }> {
  return routeRequest<{ id: string }>(`/v2/accounts/${accountId}/stakeholders/${stakeholderId}`, "PATCH", {
    name: params.name,
    email: params.email,
    kyc: { pan: params.panNumber },
  });
}

export type RouteProductResult = { id: string; activation_status: string };

// Verified against a real test-mode account: this is a TWO-phase flow, not
// one call. The initial POST creates the product config and accepts T&Cs,
// but always comes back activation_status: 'needs_clarification' with a
// `requirements` list asking for settlements.account_number/ifsc_code/
// beneficiary_name -- bank details belong here, NOT on the Stakeholder
// (see createStakeholder above). Call createRouteProduct once, persist the
// returned id, then submitRouteSettlementDetails with it (repeatable/
// idempotent -- PATCHing the same details again is harmless, and is in
// fact how you'd retry after Razorpay's own penny-test verification fails,
// e.g. on a typo'd account number).
export async function createRouteProduct(accountId: string): Promise<RouteProductResult> {
  return routeRequest<RouteProductResult>(`/v2/accounts/${accountId}/products`, "POST", {
    product_name: "route",
    tnc_accepted: true,
  });
}

export async function submitRouteSettlementDetails(
  accountId: string,
  productId: string,
  bank: { accountNumber: string; ifscCode: string; beneficiaryName: string },
): Promise<RouteProductResult> {
  return routeRequest<RouteProductResult>(
    `/v2/accounts/${accountId}/products/${productId}`,
    "PATCH",
    {
      settlements: {
        account_number: bank.accountNumber,
        ifsc_code: bank.ifscCode,
        beneficiary_name: bank.beneficiaryName,
      },
      tnc_accepted: true,
    },
  );
}

export type RouteProductStatus = {
  id: string;
  activation_status: string;
  requirements?: Array<{ field_reference?: string; reason_code?: string; resolution_url?: string }>;
};

// Read-only poll of the product config's current state. Razorpay penny-tests
// the settlement bank account asynchronously after submitRouteSettlementDetails,
// so activation_status only reaches 'activated' some time later.
export async function fetchRouteProduct(
  accountId: string,
  productId: string,
): Promise<RouteProductStatus> {
  return routeRequest<RouteProductStatus>(`/v2/accounts/${accountId}/products/${productId}`, "GET");
}

export type CreateTransferParams = {
  linkedAccountId: string;
  amountPaise: number;
  notes?: Record<string, string>;
  /** Hold the money in the linked account until this moment (Razorpay `on_hold_until`). */
  onHoldUntil?: Date | null;
  /**
   * REQUIRED in practice, not just in the type: without this, a retried
   * call (finalizeBookingFromRazorpayOrder's own idempotency-on-payment_id
   * already stops the normal webhook/callback race from double-firing this,
   * but a future manual reconciliation re-run would not be so lucky) could
   * create a second, duplicate transfer -- i.e. double-pay the host for the
   * same booking. Pass a stable key like `transfer:${bookingId}`, mirroring
   * createRazorpayRefund's `refund:${bookingId}` in razorpay.ts.
   */
  idempotencyKey: string;
};

export type CreateTransferResult = {
  items: Array<{ id: string; recipient_settlement_id: string | null; status: string }>;
};

// Splits a captured payment to the host's Linked Account. Call only after
// payment.captured is confirmed (see finalizeBookingFromRazorpayOrder in
// admin-writes.ts) -- never lets a Route failure block booking confirmation,
// since the guest's payment has already succeeded by this point.
export async function createTransferForPayment(
  paymentId: string,
  params: CreateTransferParams,
): Promise<CreateTransferResult> {
  return routeRequest<CreateTransferResult>(
    `/v1/payments/${paymentId}/transfers`,
    "POST",
    {
      transfers: [
        {
          account: params.linkedAccountId,
          amount: params.amountPaise,
          currency: "INR",
          notes: params.notes,
          on_hold: !!params.onHoldUntil,
          ...(params.onHoldUntil && { on_hold_until: Math.floor(params.onHoldUntil.getTime() / 1000) }),
        },
      ],
    },
    { "X-Razorpay-Idempotency-Key": params.idempotencyKey },
  );
}
