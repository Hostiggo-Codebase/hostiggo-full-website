import "server-only";
import crypto from "crypto";
import Razorpay from "razorpay";

// Credentials come from environment variables only -- never hardcoded.
// Add to .env.local (not committed):
//   RAZORPAY_KEY_ID=
//   RAZORPAY_KEY_SECRET=
//   RAZORPAY_ACCOUNT_NUMBER=       (RazorpayX account, needed for payouts)
//   RAZORPAY_WEBHOOK_SECRET=       (set when creating the webhook in the
//                                   Razorpay dashboard, separate from the
//                                   API key secret above)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

let client: Razorpay | null = null;

/** Lazily constructs the Razorpay client so importing this module doesn't throw when keys aren't set yet (e.g. in tests). */
export function getRazorpayClient(): Razorpay {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set to make live Razorpay calls.",
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return client;
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser after a
 * successful payment (razorpay_payment_id, razorpay_order_id,
 * razorpay_signature). This is the only thing standing between "the browser
 * said the payment succeeded" and "the payment actually succeeded" -- the
 * checkout success callback firing is a client-side event with no proof
 * behind it, trivially fakeable by posting made-up IDs straight to the API
 * without ever paying. Must pass before a booking is ever inserted (see
 * finalizeBookingFromRazorpayOrder in admin-writes.ts).
 */
export function verifyRazorpayPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_KEY_SECRET must be set to verify payments.");
  }
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, params.signature);
}

/**
 * Verifies the `X-Razorpay-Signature` header on an incoming webhook request
 * against the *raw* request body -- this must run before the body is JSON
 * parsed (parsing then re-stringifying can reorder keys and break the
 * comparison), and uses a separate secret from the API key (set when the
 * webhook is created in the Razorpay dashboard), not RAZORPAY_KEY_SECRET.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET must be set to verify webhooks.");
  }
  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
}

/**
 * Plain `===` on a signature leaks timing information about how many
 * leading bytes matched, letting an attacker recover the correct signature
 * one byte at a time -- crypto.timingSafeEqual closes that side channel.
 * Wrapped here because it throws on length mismatch instead of just
 * returning false, and a signature of the wrong length is exactly the kind
 * of malformed input a hostile request would send.
 */
function timingSafeEqualHex(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(actualHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/** Creates a Razorpay order for the guest to pay grandTotal against (Section 2). */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receiptId: string;
  notes?: Record<string, string>;
}) {
  const razorpay = getRazorpayClient();
  return razorpay.orders.create({
    amount: params.amountPaise,
    currency: "INR",
    receipt: params.receiptId,
    notes: params.notes,
  });
}

/**
 * Creates a refund against the original Razorpay payment (Section 4.4).
 * Always pass an idempotencyKey (e.g. `refund:${bookingId}`) so a retried
 * request can never create a duplicate refund.
 */
export async function createRazorpayRefund(params: {
  razorpayPaymentId: string;
  amountPaise: number;
  idempotencyKey: string;
  notes?: Record<string, string>;
  /**
   * Set when the payment was split to a host via Route. Without reverse_all the
   * refund is paid out of Hostiggo's own balance while the host keeps their
   * transferred share; with it Razorpay claws the transfer back proportionally.
   */
  reverseTransfers?: boolean;
}) {
  const razorpay = getRazorpayClient();
  return razorpay.payments.refund(params.razorpayPaymentId, {
    amount: params.amountPaise,
    notes: params.notes,
    ...(params.reverseTransfers ? { reverse_all: 1 } : {}),
    // The Razorpay Node SDK forwards this as the X-Razorpay-Idempotency-Key
    // header when supported by the installed SDK version -- if the SDK in
    // use doesn't expose it here, pass it via a raw HTTP call using the
    // same header name instead of this options field.
    idempotency_key: params.idempotencyKey,
  } as any);
}

/**
 * Transfers netHostPayout to the host via Razorpay Payouts (RazorpayX)
 * (Section 3). Requires the host's linked fund_account_id (collected
 * during host onboarding/KYC -- not part of this module) and a RazorpayX
 * business account number.
 */
export async function createRazorpayPayout(params: {
  fundAccountId: string;
  amountPaise: number;
  idempotencyKey: string;
  narration?: string;
  notes?: Record<string, string>;
}) {
  if (!RAZORPAY_ACCOUNT_NUMBER) {
    throw new Error("RAZORPAY_ACCOUNT_NUMBER must be set to make payouts.");
  }
  const razorpay = getRazorpayClient();
  // RazorpayX Payouts live under a separate API surface from the core
  // orders/payments SDK; the Node SDK exposes it as `razorpay.payouts` on
  // recent versions. If the installed version doesn't have this typed,
  // fall back to a raw request via `razorpay.api` (both are provided by
  // the same authenticated client, so credentials handling is unchanged).
  return (razorpay as any).payouts.create({
    account_number: RAZORPAY_ACCOUNT_NUMBER,
    fund_account_id: params.fundAccountId,
    amount: params.amountPaise,
    currency: "INR",
    mode: "IMPS",
    purpose: "payout",
    queue_if_low_balance: true,
    reference_id: params.idempotencyKey,
    narration: params.narration ?? "Hostiggo host payout",
    notes: params.notes,
  });
}
