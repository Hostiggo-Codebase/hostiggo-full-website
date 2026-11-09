// Request-to-book timing + state, derived from existing booking columns only
// (no expires_at column exists). Safe to import from client components.
//
// The guest pays up front. A listing with host approval turned on then holds the
// booking as PENDING until the host answers:
//
//   status 1, payment id set -> paid, awaiting the host (2h from booked_at,
//                               which is the moment the payment cleared)
//   status 2                 -> confirmed (host accepted, or an Instant Book stay)
//   status 3                 -> declined / expired / cancelled (refunded in full)

export const PENDING_STATUS_ID = 1;
export const HOST_RESPONSE_WINDOW_MS = 2 * 60 * 60 * 1000;

// Host reminders while a request is pending, as ms since the request was made.
export const HOST_REMINDER_MARKS_MS = [15, 60, 105].map((m) => m * 60 * 1000);

export type RequestPhase = "awaiting_host";

type RequestFields = {
  status_id?: number | null;
  razorpay_payment_id?: string | null;
  // Only set once a booking is confirmed (the invoice snapshot writes it).
  paid_at?: string | null;
};

/** `booked_at` is a timestamp WITHOUT time zone holding UTC wall time. */
export function parseBookedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = value.includes(" ") ? value.replace(" ", "T") : value;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const ms = Date.parse(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** A paid booking still waiting for the host's answer. */
export function requestPhase(b: RequestFields): RequestPhase | null {
  return b.status_id === PENDING_STATUS_ID && b.razorpay_payment_id ? "awaiting_host" : null;
}

/** When the host must have answered by, in epoch ms, or null if not a live request. */
export function requestDeadline(b: RequestFields & { booked_at?: string | null }): number | null {
  const start = parseBookedAt(b.booked_at);
  if (!requestPhase(b) || start == null) return null;
  return start + HOST_RESPONSE_WINDOW_MS;
}

/**
 * A request that never became a booking: still pending, or declined / expired /
 * withdrawn (cancelled and refunded before it was ever confirmed). Earnings and
 * payment history leave these out; the guest was refunded in full.
 */
export function isUnconfirmedRequest(b: RequestFields): boolean {
  return b.status_id === PENDING_STATUS_ID || (b.status_id === 3 && Boolean(b.razorpay_payment_id) && !b.paid_at);
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
