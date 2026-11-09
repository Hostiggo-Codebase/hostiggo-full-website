# Billing module

Pure, unit-tested functions for guest checkout pricing/GST, host payouts,
cancellation refunds, and pre-checkout nightly price resolution -- plus the
Razorpay integration points and the orchestrating cancel-with-refund flow
that wire them together. No business logic for any of this lives in UI
components; every calculation is exported here.

All money is handled as integer paise internally (`money.ts`) to avoid
floating-point rounding drift; rupee values only exist at function
boundaries.

## Files

- `money.ts` -- paise/rupee conversion + rounding helpers.
- `invoice.ts` -- `calculateBookingInvoice()`, Section 1: itemized
  guest checkout breakup (property + GST, Hostiggo service fee + GST,
  breakfast + GST, other services + GST, grand total).
- `payout.ts` -- `calculateHostPayout()`, Section 3: host payout net of
  5% commission + 1% TCS + 1% TDS, computed on the property (stay) price
  only -- add-ons are paid to the host in full, and nothing is ever
  computed on the service fee or any GST.
- `refund.ts` -- `calculateRefund()`, Section 4.3: single final refund
  amount for a cancelled booking under the Flexible/Moderate/Strict
  policies.
- `pricing.ts` -- Section 5: `resolveNightlyPrice()` (calendar price
  overrides base price, then the best applicable discount is applied),
  `resolveBookingSubtotal()` (sums across a stay), `validateCoupon()` /
  `applyCoupon()` (checkout-only, never affects the property card price).
- `razorpay.ts` -- thin wrapper around the `razorpay` npm SDK: order
  creation (payment capture), payment-signature and webhook-signature
  verification, refunds, payouts, plus the gateway/payout fee calculators
  (Hostiggo-side costs, never shown to the guest or deducted from the
  host). Credentials read from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
  `RAZORPAY_ACCOUNT_NUMBER` / `RAZORPAY_WEBHOOK_SECRET` env vars only.
- `cancelBooking.ts` -- `cancelBookingWithRefund()`, Section 4.8: the full
  orchestrating flow (validate -> policy -> time remaining -> refund calc
  -> payout-released check -> Razorpay refund -> DB update -> calendar
  release).
- `__tests__/` -- vitest unit tests. Run with `npm test`.

## Pay-before-confirm booking flow

`validateAndPriceBooking()` / `finalizeBookingFromRazorpayOrder()` (in
`src/lib/services/admin-writes.ts`, not this directory, but documented here
since it's the other half of `razorpay.ts`) replaced what used to be a
single `createBooking()` that inserted a CONFIRMED row immediately, with no
payment involved at all:

1. `POST /api/bookings/reserve` -- validates availability, computes the real
   price server-side, opens a Razorpay order for that amount (booking
   details go into the order's own `notes`, not anywhere client-editable),
   returns the order id to the browser. **No booking row exists yet.**
2. The guest pays via Razorpay Checkout (`src/lib/services/razorpayCheckout.ts`
   loads the widget).
3. `POST /api/bookings/confirm-payment` -- the browser's success callback
   posts back `razorpay_order_id` / `razorpay_payment_id` / `razorpay_signature`.
   `verifyRazorpayPayment()` checks the signature (HMAC-SHA256 of
   `order_id|payment_id`, keyed with `RAZORPAY_KEY_SECRET`) before anything
   else happens -- the callback firing is just a client-side event with
   nothing behind it until this passes.
4. `POST /api/webhooks/razorpay` -- independent backup path for the same
   `payment.captured` event, in case the browser callback never fires (tab
   closed right after paying). Verifies `X-Razorpay-Signature` over the raw
   body against `RAZORPAY_WEBHOOK_SECRET` (a separate secret, set when the
   webhook is created in the dashboard).

Both (3) and (4) call the same `finalizeBookingFromRazorpayOrder()`, which
is idempotent on `bookings.razorpay_payment_id` -- whichever fires first
wins, the other is a harmless no-op. It re-derives every booking field from
the order's own `notes` and re-runs the exact same availability/pricing
check the order was created with, rather than trusting anything in the
confirm request. If two guests still race to pay for the same dates (the
check-then-insert window this can't fully close, same as before), the
loser's booking is cancelled **and their payment is refunded** via
`createRazorpayRefund` -- not just a status flip, since real money changed
hands this time.

A guest who never completes payment leaves nothing behind: no pending
booking row, no held calendar nights, nothing to expire or clean up.

Not yet wired: cancellation UI still points at the older refund flow
described below; nothing here changes that.

## Known open items (flagged, not silently resolved)

1. **Host payout worked example mismatch -- resolved.** The source spec
   states a ₹10,788 net payout for a ₹10,000 property with no add-ons.
   The formula as specified (`payoutBase - 5% - 1% - 1%`) can only
   produce a number `<= payoutBase`, and ₹10,788 > ₹10,000 -- so the
   stated formula cannot reproduce the stated example under any reading
   of "5%/1%/1% of payoutBase". Decision: the ₹10,788 example is treated
   as an error in the source doc, and the formula is implemented exactly
   as specified (verified: reproduces ₹9,300 for the ₹10,000 case). This
   is now the confirmed, final formula.
2. **Strict policy's partial-refund percentage isn't specified anywhere**
   in the source doc for the ">= 7 days" case ("partial refund (per
   configured %)" -- no number given). Defaulted to 50%, configurable via
   `CancellationPolicyConfig.strictPartialRefundPercent`. Confirm the real
   number.
3. **Notifications (email/SMS/push) and an accounting ledger** are called
   out as TODOs in `cancelBooking.ts` -- no notification provider or
   ledger table exists anywhere in this codebase yet, so wiring real sends
   would mean guessing at a provider. The hooks are marked clearly at the
   point they'd fire.
4. **`cancelBookingWithRefund` is a new, separate endpoint**
   (`/api/bookings/cancel-with-refund`) from the existing
   `/api/bookings/cancel` (a simple status-flip with no refund logic,
   still used by the guest my-memories cancel flow). They are
   *intentionally not merged* in this pass, so the already-working simple
   flow can't regress. Switching the guest-facing UI over to the new
   refund-aware endpoint is a deliberate follow-up, once the migrations
   below have been run and this has been tested against a real Razorpay
   payment (impossible to fully verify end-to-end without live Razorpay
   credentials and a real captured payment, neither of which exist in this
   session).

## Required manual step: run the migrations

Same pattern as the earlier settings-toggles migration -- this session's DB
access is a different Supabase project than the one this app runs against,
so these need to be run manually in the Supabase SQL editor for the
`hostiggo_testing_schema` project:

1. `supabase/migrations/add_billing_cancellation_refund_fields.sql` --
   adds `bookings.razorpay_payment_id` / `refund_status` / `refund_amount` /
   `refund_reason` / `refund_transaction_id` / `cancelled_at` /
   `cancelled_by` / `policy_used` / `refund_processed_at` /
   `payout_released_at`; `listings.cancellation_policy`;
   `listing_discounts.valid_from` / `valid_to` / `min_stay_nights`.
2. `supabase/migrations/create_hostiggo_coupons_and_manual_settlement_tables.sql`
   -- creates `hostiggo_coupons` and `manual_settlement_flags` (neither
   existed before).
3. `supabase/migrations/add_razorpay_order_id_to_bookings.sql` -- adds
   `bookings.razorpay_order_id` (its sibling `razorpay_payment_id` is
   already live) plus an index on `razorpay_payment_id`, since that's now
   the idempotency lookup on every payment confirmation.

Until these are run, `cancelBookingWithRefund()` will fail on the columns
it can't find -- it is **not** wrapped in the same "degrade gracefully"
pattern as some earlier work this session, because a cancellation/refund
flow failing loudly is the correct behavior (silently succeeding without
actually processing a refund would be worse).

## Also required: Razorpay credentials + host fund accounts

Nothing in this module can be exercised against a real payment without:

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` in `.env.local` (test-mode keys
  for development).
- `RAZORPAY_WEBHOOK_SECRET` -- set when a webhook pointed at
  `/api/webhooks/razorpay` is created in the Razorpay dashboard, subscribed
  to at least `payment.captured`. In local dev this endpoint needs a public
  URL (e.g. an ngrok tunnel) for Razorpay to actually reach it; without a
  live webhook configured, payment confirmation still works end-to-end
  through the browser-callback path alone (`/api/bookings/confirm-payment`)
  -- the webhook is a reliability backstop, not a hard dependency for
  checkout to function.
- `RAZORPAY_ACCOUNT_NUMBER` (RazorpayX business account) for payouts.
- A way to collect and store each host's Razorpay `fund_account_id` during
  onboarding/KYC -- not part of this module, and not found anywhere in the
  existing host-onboarding wizard.

None of the above was available in this session, so the Razorpay calls in
`razorpay.ts`, and the checkout flow built on top of them, are wired
correctly (real SDK, real parameter shapes, verified against the installed
SDK's TypeScript types, `npx tsc --noEmit` / `npm run build` / `npm test`
all clean) but have never been executed against a real Razorpay order or
payment -- there is no Razorpay account of any kind (test or live)
reachable from this session.
