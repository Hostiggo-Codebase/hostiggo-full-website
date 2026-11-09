# Booking requests (host approval)

"Accept instant bookings" is **on by default**. A host can turn it off in Host Settings > Booking
Settings, which sets `listings.booking_mode = 'manual'` on all their listings. Any other value
(`NULL`, `'auto'`) is Instant Book.

Instant Book listings confirm as soon as the guest pays. Listings set to `manual` use
pay-first, host-accepts:

1. Guest pays up front through the normal Razorpay checkout (`/api/bookings/reserve` ->
   `confirm-payment` / webhook -> `finalizeBookingFromRazorpayOrder`).
2. Because the listing needs approval, the booking is stored as `status_id = 1` (PENDING) with the
   payment attached (`insertPaidBookingRequest`). The dates are held for the guest for 2h
   (`findPaymentHolds`). No invoice, ledger row or host transfer yet.
3. The host gets an in-app notification + push + email with the guest, dates, guest count and amount, and
   Accept / Decline buttons on the Notifications page (`BookingRequestCard`), Host > Bookings and the
   booking details page. They have **2 hours** from payment.
4. **Accept** (`PATCH /api/bookings` `action: "respond"`): dates and price are re-checked, the booking
   becomes `status_id = 2`, the invoice is frozen, the host transfer is created, and
   `notifyBookingConfirmed` sends WhatsApp, email and in-app notifications to the guest and host.
5. **Decline, no answer in 2h, guest/host cancel, dates gone or price changed**:
   `refundAndCancelRequest` cancels the booking (`status_id = 3`) and refunds the **full** amount via
   Razorpay in the same step (idempotency key `refund:request:<bookingId>`). A failed refund still cancels,
   sets `refund_status = 'failed'`, writes a `manual_settlement_flags` row and raises a critical admin alert;
   `retryFailedRefund` and the `refund.processed` / `refund.failed` webhooks take it from there.

| State | status_id | razorpay_payment_id | deadline |
|---|---|---|---|
| Paid, awaiting host | 1 | set | `booked_at` + 2h |
| Confirmed | 2 | set | |
| Declined / expired / withdrawn | 3 | set, `refund_*` filled | |

State is derived from existing columns only (no migration). Expiry and host reminders (15m, 1h, 105m)
run in the existing 5-minute cron (`/api/cron/retry-whatsapp`, `sweepBookingRequests`), so expiry can lag
by up to 5 minutes; `respondToBookingRequest` also refuses (and refunds) an answer after the 2h cutoff.
Code: `src/lib/billing/bookingRequest.ts` (timing, safe for the client) and the "Request to book" section of
`src/lib/services/admin-writes.ts`.

WhatsApp is sent on confirmation using the two approved templates. A WhatsApp "new request" message to the
host needs a new approved Twilio template.

## One-time data seed (not DDL)

`bookings.status_id` is a foreign key to `booking_status`, which only holds 2 and 3. Add the
pending row in every environment before turning a listing's Instant Book off:

```sql
insert into hostiggo_testing_schema.booking_status (status_id, status_name, description)
values (1, 'PENDING', 'Booking request awaiting host response')
on conflict (status_id) do nothing;
```
