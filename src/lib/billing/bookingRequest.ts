// Request-to-book timing + state, derived from existing booking columns only
// (no expires_at column exists). Safe to import from client components.
//
//   status 1, no razorpay_order_id           -> awaiting the host (24h from booked_at)
//   status 1, razorpay_order_id, no payment  -> host accepted, guest has 2h to pay
//                                               (booked_at is reset on accept)
//   status 2                                  -> confirmed
//   status 3                                  -> declined / expired / cancelled

export const PENDING_STATUS_ID = 1;
export const HOST_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const GUEST_PAYMENT_WINDOW_MS = 2 * 60 * 60 * 1000;
// A UPI/netbanking payment started just before the deadline can capture a few
// minutes late; honour it rather than refunding someone who paid in time.
export const PAYMENT_GRACE_MS = 10 * 60 * 1000;

// Host reminders while a request is pending, as ms since the request was made.
export const HOST_REMINDER_MARKS_MS = [1, 6, 12, 20, 23].map((h) => h * 60 * 60 * 1000);
// Guest reminders during the payment window, as ms since the host accepted.
export const GUEST_REMINDER_MARKS_MS = [60 * 60 * 1000, 105 * 60 * 1000];

export type RequestPhase = "awaiting_host" | "awaiting_payment";

type RequestFields = {
  status_id?: number | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
};

/** `booked_at` is a timestamp WITHOUT time zone holding UTC wall time. */
export function parseBookedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = value.includes(" ") ? value.replace(" ", "T") : value;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const ms = Date.parse(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms;
}

export function requestPhase(b: RequestFields): RequestPhase | null {
  if (b.status_id !== PENDING_STATUS_ID || b.razorpay_payment_id) return null;
  return b.razorpay_order_id ? "awaiting_payment" : "awaiting_host";
}

/** The deadline shown to users, in epoch ms, or null if not a live request. */
export function requestDeadline(b: RequestFields & { booked_at?: string | null }): number | null {
  const phase = requestPhase(b);
  const start = parseBookedAt(b.booked_at);
  if (!phase || start == null) return null;
  return start + (phase === "awaiting_host" ? HOST_RESPONSE_WINDOW_MS : GUEST_PAYMENT_WINDOW_MS);
}

/** When the sweep cancels it: the deadline, plus a grace period for payments. */
export function requestHardExpiry(b: RequestFields & { booked_at?: string | null }): number | null {
  const deadline = requestDeadline(b);
  if (deadline == null) return null;
  return requestPhase(b) === "awaiting_payment" ? deadline + PAYMENT_GRACE_MS : deadline;
}

/**
 * A request that never reached payment: still pending, or declined / expired /
 * withdrawn. These are not bookings, so earnings, payment history and the host
 * calendar leave them out.
 */
export function isUnpaidRequest(b: RequestFields & { refund_status?: string | null }): boolean {
  if (b.razorpay_payment_id) return false;
  return b.status_id === PENDING_STATUS_ID || (b.status_id === 3 && b.refund_status === "not_applicable");
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
