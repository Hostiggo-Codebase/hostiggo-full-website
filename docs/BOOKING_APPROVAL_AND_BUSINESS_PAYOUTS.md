# Booking approval, pay-upfront requests and business payouts

Everything changed on the website in this round of work, the logic behind it, and what the mobile app
needs to match. PRs: #196 (settings control, teammate), #199 (pay-upfront flow), #200 + #201 ("Coming soon",
default fix), #202 (business payouts, open at the time of writing).

Source of truth is the website code; file paths below point at it. The server rules live in
`src/lib/services/admin-writes.ts`, so the app should **call the same endpoints** and mirror only the
display logic (states, countdowns, copy).

---

## 1. Summary of the behaviour

| Topic | Rule |
|---|---|
| Default | **Manual approval is OFF.** Listings are Instant Book unless the host turns approval on. |
| Instant Book | Guest pays, booking is confirmed immediately. Unchanged. |
| Approval ON | Guest **pays up front**. The booking is held as PENDING. The host has **2 hours** to accept. |
| Host accepts | Booking confirmed. WhatsApp + email + in-app to guest and host. |
| Host declines / 2h passes / anyone cancels | Booking cancelled and **full refund** started in the same step. |
| Host profile | "Coming soon" banner on every host profile (`/hosts/[hostId]`). |
| Payouts | Hosts can receive payouts as an individual **or a registered business** (LLP, company, firm, ...). |

---

## 2. The approval setting (`listings.booking_mode`)

- Stored per listing, but the host sets it once for **all** their listings.
- **`'manual'` = host approval. Anything else (`NULL`, `'auto'`) = Instant Book.** An empty value is *not* manual.
- Host UI: Settings > Booking Preferences, switch "Review each booking request" (on = manual, **off by default**).
- API: `GET/PATCH /api/host/booking-preferences`
  - `GET` -> `{ bookingMode: 'auto' | 'manual' | 'mixed', listingCount }` (`'auto'` when empty or no listings).
  - `PATCH { bookingMode: 'auto' | 'manual' }` -> applies to every listing of the host. `409` if the host has no listing.
- Server flag used at booking time: `requiresHostApproval = listing.booking_mode === 'manual'`
  (`validateAndPriceBooking`).
- Guest-facing flag: `isInstantBook = booking_mode !== 'manual'` (`src/lib/api.ts`).

No data migration was needed: existing `NULL` listings simply became Instant Book.

---

## 3. Booking states (no new tables)

State is derived from existing `bookings` columns (`src/lib/billing/bookingRequest.ts`):

| State | `status_id` | `razorpay_payment_id` | Deadline |
|---|---|---|---|
| Paid, waiting for the host | `1` (PENDING) | set | `booked_at` + 2h |
| Confirmed | `2` | set | |
| Declined / expired / withdrawn | `3` | set, `refund_*` filled | |

Notes for the app:
- `booked_at` is a timestamp **without** time zone holding **UTC**. Parse it as UTC (`parseBookedAt`), otherwise the
  countdown is off by the device offset.
- "Is a request" = `status_id === 1 && razorpay_payment_id`. Deadline = `booked_at + 2h`
  (`HOST_RESPONSE_WINDOW_MS`).
- Show a cancelled-before-confirmation booking as "request declined/expired", not as a normal cancelled stay. Such a
  booking has `status_id 3`, a payment id, and **no `paid_at`** (`isUnconfirmedRequest`). Host earnings / payment
  history hide these.
- The database availability trigger only knows `status_id 2`. While a request is pending, the dates are held by the
  app (`findPaymentHolds`): no other guest can book or pay for those nights for the 2h.

---

## 4. Flow A: Instant Book (unchanged)

1. `POST /api/bookings/reserve` -> Razorpay order.
2. Guest pays in Razorpay Checkout.
3. `POST /api/bookings/confirm-payment` (and the Razorpay webhook, whichever arrives first; both are idempotent).
4. Server inserts the booking with `status_id 2`, freezes the invoice, creates the host transfer, notifies both sides.

## 5. Flow B: approval ON (pay up front, host has 2h)

1. **Reserve**: `POST /api/bookings/reserve` is the *same call* as Instant Book. It always returns a Razorpay order
   (`{ paymentRequired, razorpayOrderId, razorpayKeyId, amountPaise, amountRupees, currency }`). Guard: a guest who
   already has an open paid request for overlapping dates gets `409 REQUEST_ALREADY_PENDING`.
2. **Pay**: Razorpay Checkout, same as Instant Book.
3. **Confirm**: `POST /api/bookings/confirm-payment { razorpayOrderId, razorpayPaymentId, razorpaySignature }`
   returns the booking row. **For a manual listing the row has `status_id: 1`, not `2`.** That is how the client
   knows it is a request:
   - `status_id 1` -> "Payment received, request sent. The host has 2 hours to accept; otherwise you are refunded in full."
   - `status_id 2` -> "Booking confirmed".
   - The server inserts a PENDING row with `amount_paise`, payment/order ids, add-ons. No invoice, ledger row or host
     transfer yet. Notifications: guest "Request sent", host "New booking request".
4. **Host decides** (see 5.1). Accept -> `status_id 2` + confirmation notifications. Decline -> refund.
5. **Nobody answers**: the 5-minute cron (section 7) cancels and refunds after 2h.

### 5.1 Host actions

`PATCH /api/bookings`:
- `{ action: 'respond', bookingId, decision: 'accept' | 'reject' }` (host only)
- `{ action: 'withdraw', bookingId }` (guest cancels their own pending request; full refund)
- Guest or host may also use `POST /api/bookings/cancel-with-refund { bookingId, reason? }`. For a pending request it
  routes to the same full-refund path and returns `{ cancelled: true, refunded: true }` (no cancellation policy applies).

**Accept** (`respondToBookingRequest`), in order:
1. Caller must be the listing's host (`403 FORBIDDEN`), booking must still be a pending request (`409 NOT_PENDING`).
2. If `now >= booked_at + 2h`: cancel + refund, reply `410 EXPIRED`.
3. Re-check availability and price (`validateAndPriceBooking` excluding this booking's own hold). If the dates were
   taken, the price drifted from `amount_paise`, or the stay date passed: **refund + cancel**, reply
   `409 UNAVAILABLE`. A transient DB error, or the host's own missing payout account (`HOST_PAYOUT_MISSING`), is
   rethrown instead: the host can fix it and retry within the window.
4. Conditional update to `status_id 2` (only while still pending, paid and un-refunded). The DB availability trigger
   runs here as the last line of defence.
5. Freeze the invoice (`snapshotInvoiceOnBooking`), create the host transfer (`createHostTransferForBooking`), send
   confirmations (`notifyBookingConfirmed`).

**Decline / expiry / cancel** all go through one function, `refundAndCancelRequest(bookingId, { reason, cancelledBy })`:
1. Lock: conditional update `refund_status = 'processing'` where `status_id = 1`, payment present, `refund_status`
   null. If nothing matches, someone else already acted; do nothing.
2. Razorpay refund for the full paid amount, idempotency key `refund:request:<bookingId>`.
3. Set `status_id 3`, `refund_status` (`processed` | `failed`), `refund_amount`, `refund_transaction_id`,
   `refund_processed_at`, `cancellation_reason`, `cancelled_at`, `cancelled_by`.
4. If Razorpay refuses: the booking is **still cancelled**, `refund_status = 'failed'`, a `manual_settlement_flags`
   row is written and a critical admin alert is sent. `retryFailedRefund` and the Razorpay `refund.processed` /
   `refund.failed` webhooks finish the job.
5. Notifications: guest (in-app + email, with the refund-arrival note), host (in-app).

Cancel reasons used: `Host declined`, `Host did not respond in time`, `Dates no longer available`,
`Cancelled by guest`, `Cancelled by host`, `Dates were booked by another guest first`.

### 5.2 Races

- Two guests pay for the same nights: the second is caught by the hold check; if both slip through, the later
  booking id is refunded (`insertPaidBookingRequest` re-check) and the guest gets `PAYMENT_REFUNDED`.
- Callback + webhook for the same payment: the first wins; the second returns the same row (idempotent on payment id).
- Host accept vs cron expiry vs guest withdraw: all use the conditional lock above, only one succeeds.

### 5.3 Error codes the app should handle

| Code / status | Meaning |
|---|---|
| `REQUEST_ALREADY_PENDING` 409 | Guest already has an open paid request for these dates |
| `DATES_UNAVAILABLE` 409 | Blocked, booked or held by another guest |
| `HOST_PAYOUT_MISSING` 409 | Host can't be paid yet (see section 9) |
| `PAYMENT_REFUNDED` 409 | Payment taken but booking impossible; already refunded |
| `CONFIRMATION_PENDING` 502 | Paid, still confirming; do not pay again |
| `NOT_PENDING` 409 / `EXPIRED` 410 / `UNAVAILABLE` 409 / `FORBIDDEN` 403 | Host respond / withdraw errors |

---

## 6. Notifications

All booking-request messages go through `notify()` (in-app row + push) and `emailUser()`; confirmations also send WhatsApp.

| Event | Guest | Host |
|---|---|---|
| Payment received, request placed | in-app + email "Request sent" (template `booking_confirmed_guest`) | in-app + push + email "New booking request" (template `booking_received_host`), metadata `kind: 'booking_request'`, `respond_by` |
| Reminders (15m, 1h, 105m after payment) | | in-app (+ email from the 1h mark), metadata `kind: 'booking_request_reminder'`, `reminder_mark` |
| Accepted | in-app + email + **WhatsApp** (`booking_confirmation_guest`) | in-app + email + **WhatsApp** (`booking_received_host`) |
| Declined / expired / unavailable | in-app + email, with refund line | in-app |
| Withdrawn by guest | in-app + email | in-app |

- The host row carries everything for the app to render Accept / Decline without another list call: metadata has
  `booking_id`, `listing_id`, `start_date`, `end_date`, `kind`, `respond_by`. The website card (`BookingRequestCard`)
  loads the booking via `GET /api/bookings/details?id=` and shows guest, dates, guests, amount paid and the countdown.
  Re-read the booking when rendering; the notification can be stale (already answered or expired).
- Reuse the DB-trigger template ids so `notify()` overwrites the generic "Booking Confirmed!" row instead of adding
  a second one. The website delays the toast ~1.5s for those templates to show the final text.
- WhatsApp is sent **only on confirmation**. A "new request" WhatsApp to the host needs a new approved Twilio template
  and an env var; not built.

---

## 7. Expiry and reminders (cron)

`sweepBookingRequests`, called from `/api/cron/retry-whatsapp` every 5 minutes (`vercel.json`):
- Pending paid rows past `booked_at + 2h` -> `refundAndCancelRequest` ("Host did not respond in time").
- Reminders at 15 / 60 / 105 minutes; each sent once (de-duplicated by metadata); a missed mark is not replayed.
- Expiry can lag up to 5 minutes; `respond` enforces the 2h cutoff itself, so a late tap can never accept.

---

## 8. Host profile "Coming soon"

`/hosts/[hostId]` shows an amber banner, "Coming soon / Host profiles are on the way. Check back soon.", on **every**
host profile. It is not tied to payouts. (An earlier version wrongly tied it to payout status and also disabled
booking on property pages; both were removed in #201.) The app profile screen should show the same banner.

---

## 9. Payouts for businesses

### Why
Payouts were hard-coded to a person: Razorpay accounts were created as `individual`, and the PAN was always sent as the
stakeholder's personal PAN. A company/LLP has a company PAN (4th character `F`, `C`, ...), which Razorpay rejects as a
stakeholder PAN, so setup stalled at the stakeholder step and the product/settlement config was never created.

### Data (`host_payout_methods`, migration `20261111000001_payout_business_type.sql`)
- `business_type text not null default 'individual'` with a check constraint.
- `signatory_name`, `signatory_pan` (the person who signs for a business; their own personal PAN).
- Allowed values (Razorpay Route `business_type`): `individual`, `proprietorship`, `partnership`, `llp`,
  `private_limited`, `public_limited`, `trust`, `society`, `ngo`, `not_yet_registered`, `educational_institutes`.

### Rules (shared, safe for the client: `src/lib/payoutBusiness.ts`)
- **PAN holder type**, the 4th character of the PAN, must fit the account type: individual / proprietorship `P`,
  partnership / llp `F`, private / public limited `C`, trust `T`, society / ngo `A` or `T`, not-yet-registered `P/A/B`,
  educational `T/A/C`. Mismatch -> `400` with a clear message (`panProblemForBusiness`).
- `isCompanyType(type)` = anything except `individual`.
- `needsStakeholder(type)` = `individual` or `proprietorship` only.
- The business type **cannot change once a Razorpay account exists** (`409`), Razorpay fixes it at creation.

### API
`GET /api/host/payout-methods` additionally returns `business_type`, `signatory_name`, `signatory_pan` (masked).
`PATCH` accepts `businessType`, `signatoryName`, `signatoryPan` (signatory PAN must be a personal PAN, 4th char `P`)
alongside the existing fields. For a business, `accountHolderName` is the **registered business name** and must match
the bank account holder and the PAN's name (same fuzzy name match as before).

### Onboarding (`runRouteOnboarding`, resumable, idempotent)
1. Linked account: `createLinkedAccount` with the real `business_type` and, for businesses, `legal_info.pan` (company
   PAN). Legal name = business name (digits and `& . , ( ) -` allowed; `cleanBusinessName`).
2. Update of an existing account tolerates "activation form locked by admin" (Razorpay locks accounts its team has handled).
3. Stakeholder: individuals as before. A business only gets one if a signatory name + personal PAN were given;
   otherwise Razorpay activates it from the business PAN and bank account.
4. Product config + settlement bank details (beneficiary = business name). Product `activated` -> status `active`,
   otherwise `onboarding`; `syncRouteStatus` / `onboarding-status` pick up later activation.

### Readiness / bookability
"Payout account exists" = account id **and** product id **and** status not `rejected` **and**
(stakeholder id **or** the business type is not individual/proprietorship). Used by:
- `hostHasPayoutAccount` (blocks booking with `HOST_PAYOUT_MISSING`, checked at reserve, finalize and host accept),
- `getHostPayoutReadiness` (gates going live).

### The Dignified Hospitality Services LLP case (host `6d286b3a…`)
Razorpay account was already an LLP, `status=created`, with no stakeholder and no product. Fixed directly: product
created, settlement bank account submitted (beneficiary = the LLP), product `activated`; DB row set to
`business_type='llp'`, `status='active'`. The company PAN could not be attached to the Razorpay account because its
activation form is locked by a Razorpay admin. The site only treats this host as bookable once the readiness rule above
is deployed.

---

## 10. What the app must do

1. **Settings**: booking-approval switch calling `/api/host/booking-preferences`; default off; copy: pay upfront,
   2 hours, full refund.
2. **Booking checkout**: same reserve -> Razorpay -> confirm-payment flow for both modes. After confirm, branch on
   `booking.status_id` (1 = request sent, 2 = confirmed). Never offer to pay again after payment succeeded.
3. **Guest booking screen** for a pending request: "Waiting for the host" with countdown to `booked_at + 2h`,
   amount paid, "Cancel request" (`withdraw`, refunded in full). Show declined/expired requests as such with the refund
   state (`refund_status`, `refund_amount`); "Retry refund" if `refund_status === 'failed'`.
4. **Host inbox / notifications**: render `kind: 'booking_request'` rows with Accept / Decline, details and countdown;
   re-fetch the booking before showing buttons. Also surface pending requests on the host bookings list and details.
5. **Host lists/earnings**: keep unconfirmed requests (pending, or cancelled without `paid_at`) out of earnings,
   payment history and the calendar (calendar shows `status_id 2` only).
6. **Push/WhatsApp**: nothing new on the client; the server sends them.
7. **Host profile**: "Coming soon" banner.
8. **Payout setup**: "Receive payouts as" selector, business-name label, signatory fields for businesses, PAN-type
   validation from the table in section 9, selector locked once a payout account exists.
9. **Error handling**: map the codes in 5.3 to friendly messages.

---

## 11. Operations checklist

- Seed once per environment, otherwise inserting a pending booking fails on a foreign key:
  ```sql
  insert into hostiggo_testing_schema.booking_status (status_id, status_name, description)
  values (1, 'PENDING', 'Booking request awaiting host response')
  on conflict (status_id) do nothing;
  ```
- Apply `supabase/migrations/20261111000001_payout_business_type.sql` (already applied to the live project).
- `CRON_SECRET` must be set (the 5-minute sweep returns 401 without it, so requests would never expire).
- Existing hosts with an empty `booking_mode` are now Instant Book. Anyone who relied on the old manual default must
  turn approval on again.
- Data snapshot when this was written: 41 hosts had live listings; 27 had no payout row at all and 2 were incomplete,
  so their stays are not bookable until payouts are finished (`HOST_PAYOUT_MISSING`).

## 12. Tests

- `src/lib/services/__tests__/bookingRequests.test.ts`: instant default, paid-pending insert, idempotency, holds,
  accept (transfer + 3-channel notifications), decline/expiry refunds, refund failure, withdraw/cancel, sweep, reminders.
- `src/lib/billing/__tests__/bookingRequest.test.ts`: timing, phase, `isUnconfirmedRequest`.
- `src/lib/__tests__/payoutBusiness.test.ts`, `src/lib/services/__tests__/hostPayoutReadiness.test.ts`: business types,
  PAN fit, stakeholder rule.
- Not covered by automated tests: the real Razorpay checkout, a brand-new company account created through Razorpay,
  and the UI. Test those manually (Razorpay test mode) before release.

## 13. Known gaps

- Brand-new company accounts: Razorpay's signatory/stakeholder requirements may differ by business type; unverified.
- No WhatsApp message for "new request" to the host (needs a new approved template).
- Expiry granularity is the 5-minute cron.
- A host's approval setting applies to all listings; a new listing starts as Instant Book until the host toggles again.
