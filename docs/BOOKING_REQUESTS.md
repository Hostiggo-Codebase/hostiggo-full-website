# Booking requests (host approval)

Listings that are not Instant Book (`listings.booking_mode <> 'auto'`, the default) use
request-to-book:

1. Guest requests. A `bookings` row is created with `status_id = 1`, no Razorpay order, no
   payment. The host has **24h** from `booked_at`.
2. Host accepts (`PATCH /api/bookings` `action: "respond"`). A Razorpay order is created and
   stored in `razorpay_order_id`, `booked_at` is reset to now, and the guest has **2h** to pay.
   The dates are held for that guest (`findPaymentHolds`). Overlapping open requests are declined.
3. Guest pays. `finalizeBookingFromRazorpayOrder` sees `bookingId` in the order notes, moves the
   booking to `status_id = 2` and runs the usual invoice / Route transfer / notifications.
   A payment that arrives after the booking expired or was cancelled is refunded in full.
4. Host declines, host does not answer in 24h, or guest does not pay in 2h: the booking becomes
   `status_id = 3` with `refund_status = 'not_applicable'`. Nobody was charged.

State is derived from existing columns only (no migration):

| State | status_id | razorpay_order_id | razorpay_payment_id | deadline |
|---|---|---|---|---|
| Requested | 1 | null | null | booked_at + 24h |
| Accepted, awaiting payment | 1 | set | null | booked_at + 2h |
| Confirmed | 2 | set | set | |
| Declined / expired / unpaid | 3 | any | null | |

Expiry and reminders run in the existing 5-minute cron (`/api/cron/retry-whatsapp`,
`sweepBookingRequests`). Code: `src/lib/billing/bookingRequest.ts` (timing, safe for the
client) and the "Request to book" section of `src/lib/services/admin-writes.ts`.

## One-time data seed (not DDL)

`bookings.status_id` is a foreign key to `booking_status`, which only holds 2 and 3. Add the
pending row in every environment before enabling request listings:

```sql
insert into hostiggo_testing_schema.booking_status (status_id, status_name, description)
values (1, 'PENDING', 'Booking request awaiting host or guest payment')
on conflict (status_id) do nothing;
```
