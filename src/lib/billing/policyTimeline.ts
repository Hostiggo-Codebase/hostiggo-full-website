import { CANCELLATION_POLICY_DEFAULTS as D } from "./refund";

export type PolicyName = "flexible" | "moderate" | "strict";

export type PolicyStep = {
  /** Refund applies when cancelling before this moment (null = until check-in). */
  until: Date | null;
  refundPercent: number;
  tone: "good" | "partial" | "none";
  label: string;
};

const fmt = (d: Date) =>
  d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

/**
 * Check-in as an absolute moment: the stay's first day at the listing's
 * check-in time, in IST (the same instant calculateRefund measures from).
 */
export function checkInMoment(startDate: string, checkInTime?: string | null): Date {
  const time = /^\d{1,2}:\d{2}/.test(checkInTime ?? "") ? checkInTime!.slice(0, 5).padStart(5, "0") : "14:00";
  return new Date(`${startDate.slice(0, 10)}T${time}:00+05:30`);
}

/** Hosts are paid this long after check-in, so a stay that falls through can still be refunded in full. */
const PAYOUT_HOLD_AFTER_CHECK_IN_MS = 24 * 60 * 60 * 1000;

/**
 * When a booking's host transfer may be released: 24h after check-in (the
 * Airbnb model). Null when that moment has already passed, i.e. nothing to hold.
 */
export function payoutReleaseMoment(
  startDate: string,
  checkInTime?: string | null,
  now: Date = new Date(),
): Date | null {
  const release = new Date(checkInMoment(startDate, checkInTime).getTime() + PAYOUT_HOLD_AFTER_CHECK_IN_MS);
  return release.getTime() > now.getTime() + 60_000 ? release : null;
}

/**
 * The concrete, dated refund schedule for a booking, mirroring
 * calculateRefund() in ./refund.ts -- so what the guest reads is exactly what
 * cancelling will do.
 */
export function cancellationTimeline(
  policy: string | null | undefined,
  checkIn: Date,
  strictPartialPercent?: number | null,
): PolicyStep[] {
  const hoursBefore = (h: number) => new Date(checkIn.getTime() - h * 3600_000);
  const p = (policy ?? "moderate") as PolicyName;

  if (p === "flexible") {
    const cutoff = hoursBefore(D.flexibleFullRefundHours);
    return [
      { until: cutoff, refundPercent: 100, tone: "good", label: `Full refund if you cancel before ${fmt(cutoff)}` },
      { until: null, refundPercent: 0, tone: "none", label: `No refund after ${fmt(cutoff)}` },
    ];
  }

  if (p === "strict") {
    const pct = Math.round(
      (strictPartialPercent != null && strictPartialPercent > 0
        ? strictPartialPercent > 1
          ? strictPartialPercent / 100
          : strictPartialPercent
        : D.strictPartialRefundPercent) * 100,
    );
    const cutoff = hoursBefore(D.strictPartialRefundDays * 24);
    return [
      { until: cutoff, refundPercent: pct, tone: "partial", label: `${pct}% refund if you cancel before ${fmt(cutoff)}` },
      { until: null, refundPercent: 0, tone: "none", label: `No refund after ${fmt(cutoff)}` },
    ];
  }

  const full = hoursBefore(D.moderateFullRefundDays * 24);
  const partial = hoursBefore(D.moderateNoRefundHours);
  const pct = Math.round(D.moderatePartialRefundPercent * 100);
  return [
    { until: full, refundPercent: 100, tone: "good", label: `Full refund if you cancel before ${fmt(full)}` },
    { until: partial, refundPercent: pct, tone: "partial", label: `${pct}% refund if you cancel before ${fmt(partial)}` },
    { until: null, refundPercent: 0, tone: "none", label: `No refund after ${fmt(partial)}` },
  ];
}

export const POLICY_LABELS: Record<PolicyName, string> = {
  flexible: "Flexible",
  moderate: "Moderate",
  strict: "Strict",
};

/** Refunds cover the stay itself; taxes and Hostiggo's service fee are not refunded. */
export const REFUND_SCOPE_NOTE =
  "Refunds apply to the stay and add-on amounts. GST and the Hostiggo service fee are non-refundable.";
